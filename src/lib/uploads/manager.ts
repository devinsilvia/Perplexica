import path from "path";
import BaseEmbedding from "../models/base/embedding"
import crypto from "crypto"
import fs from 'fs';
import { splitText } from "../utils/splitText";
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';
import officeParser from 'officeparser'

const supportedMimeTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'] as const

type SupportedMimeType = typeof supportedMimeTypes[number];

type UploadManagerParams = {
    embeddingModel: BaseEmbedding<any>;
}

type RecordedFile = {
    id: string;
    name: string;
    filePath: string;
    contentPath: string;
    uploadedAt: string;
    contentHash?: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    fileType?: SupportedMimeType;
}

type FileRes = {
    fileName: string;
    fileExtension: string;
    fileId: string;
}

const extensionMimeMap: Record<string, SupportedMimeType> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
};

class UploadManager {
    private embeddingModel: BaseEmbedding<any>;
    static uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    static uploadedFilesRecordPath = path.join(this.uploadsDir, 'uploaded_files.json');
    static chunkSize = 512;
    static chunkOverlap = 128;

    constructor(private params: UploadManagerParams) {
        this.embeddingModel = params.embeddingModel;

        if (!fs.existsSync(UploadManager.uploadsDir)) {
            fs.mkdirSync(UploadManager.uploadsDir, { recursive: true });
        }

        if (!fs.existsSync(UploadManager.uploadedFilesRecordPath)) {
            const data = {
                files: []
            }

            fs.writeFileSync(UploadManager.uploadedFilesRecordPath, JSON.stringify(data, null, 2));
        }
    }

    private static getRecordedFiles(): RecordedFile[] {
        const data = fs.readFileSync(UploadManager.uploadedFilesRecordPath, 'utf-8');
        return JSON.parse(data).files;
    }

    private static addNewRecordedFile(fileRecord: RecordedFile) {
        const currentData = this.getRecordedFiles()

        currentData.push(fileRecord);

        fs.writeFileSync(UploadManager.uploadedFilesRecordPath, JSON.stringify({ files: currentData }, null, 2));
    }

    static getFile(fileId: string): RecordedFile | null {
        const recordedFiles = this.getRecordedFiles();

        return recordedFiles.find(f => f.id === fileId) || null;
    }

    private static findCachedFile(params: {
        contentHash: string;
        embeddingModel: string;
        fileType: SupportedMimeType;
        chunkSize: number;
        chunkOverlap: number;
    }): RecordedFile | null {
        const recordedFiles = this.getRecordedFiles();

        return recordedFiles.find((file) => {
            return file.contentHash === params.contentHash
                && file.embeddingModel === params.embeddingModel
                && file.fileType === params.fileType
                && file.chunkSize === params.chunkSize
                && file.chunkOverlap === params.chunkOverlap
                && fs.existsSync(file.contentPath);
        }) || null;
    }

    static getFileChunks(fileId: string): { content: string; embedding: number[] }[] {
        try {
            const recordedFile = this.getFile(fileId);

            if (!recordedFile) {
                throw new Error(`File with ID ${fileId} not found`);
            }

            const contentData = JSON.parse(fs.readFileSync(recordedFile.contentPath, 'utf-8'))

            return contentData.chunks;
        } catch (err) {
            console.log('Error getting file chunks:', err);
            return [];
        }
    }

    private async extractContentAndEmbed(filePath: string, fileType: SupportedMimeType): Promise<string> {
        switch (fileType) {
            case 'text/plain':
            case 'text/markdown':
                const content = fs.readFileSync(filePath, 'utf-8');

                const splittedText = splitText(content, UploadManager.chunkSize, UploadManager.chunkOverlap)
                const embeddings = await this.embeddingModel.embedText(splittedText)

                if (embeddings.length !== splittedText.length) {
                    throw new Error('Embeddings and text chunks length mismatch');
                }

                const contentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const data = {
                    chunks: splittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: embeddings[i],
                        }
                    })
                }

                fs.writeFileSync(contentPath, JSON.stringify(data, null, 2));

                return contentPath;
            case 'application/pdf':
                const pdfBuffer = fs.readFileSync(filePath);

                const parser = new PDFParse({
                    data: pdfBuffer,
                    CanvasFactory
                })

                const pdfText = await parser.getText().then(res => res.text)

                const pdfSplittedText = splitText(pdfText, UploadManager.chunkSize, UploadManager.chunkOverlap)
                const pdfEmbeddings = await this.embeddingModel.embedText(pdfSplittedText)

                if (pdfEmbeddings.length !== pdfSplittedText.length) {
                    throw new Error('Embeddings and text chunks length mismatch');
                }

                const pdfContentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const pdfData = {
                    chunks: pdfSplittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: pdfEmbeddings[i],
                        }
                    })
                }

                fs.writeFileSync(pdfContentPath, JSON.stringify(pdfData, null, 2));

                return pdfContentPath;
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                const docBuffer = fs.readFileSync(filePath);

                const docText = await officeParser.parseOfficeAsync(docBuffer)

                const docSplittedText = splitText(docText, UploadManager.chunkSize, UploadManager.chunkOverlap)
                const docEmbeddings = await this.embeddingModel.embedText(docSplittedText)

                if (docEmbeddings.length !== docSplittedText.length) {
                    throw new Error('Embeddings and text chunks length mismatch');
                }

                const docContentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const docData = {
                    chunks: docSplittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: docEmbeddings[i],
                        }
                    })
                }

                fs.writeFileSync(docContentPath, JSON.stringify(docData, null, 2));

                return docContentPath;
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    private getEmbeddingCacheKey(): string {
        return this.embeddingModel.getCacheKey();
    }

    async processFiles(files: File[]): Promise<FileRes[]> {
        const processedFiles: FileRes[] = [];

        await Promise.all(files.map(async (file) => {
            const fileExtension = file.name.split('.').pop()?.toLowerCase();
            const inferredType = fileExtension ? extensionMimeMap[fileExtension] : undefined;
            const fileType =
                (supportedMimeTypes as unknown as string[]).includes(file.type)
                    ? (file.type as SupportedMimeType)
                    : file.type === 'application/octet-stream' && inferredType
                      ? inferredType
                      : null;

            if (!fileType) {
                throw new Error(`File type ${file.type} not supported`);
            }

            const fileId = crypto.randomBytes(16).toString('hex');

            const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
            const filePath = path.join(UploadManager.uploadsDir, fileName);

            const buffer = Buffer.from(await file.arrayBuffer())
            const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
            const embeddingModelKey = this.getEmbeddingCacheKey();
            const cachedFile = UploadManager.findCachedFile({
                contentHash,
                embeddingModel: embeddingModelKey,
                fileType: fileType,
                chunkSize: UploadManager.chunkSize,
                chunkOverlap: UploadManager.chunkOverlap,
            });

            let contentFilePath: string;
            let finalFilePath = filePath;

            if (cachedFile) {
                contentFilePath = cachedFile.contentPath;
                if (cachedFile.filePath && fs.existsSync(cachedFile.filePath)) {
                    finalFilePath = cachedFile.filePath;
                } else {
                    fs.writeFileSync(finalFilePath, buffer);
                }
            } else {
                fs.writeFileSync(finalFilePath, buffer);
                contentFilePath = await this.extractContentAndEmbed(finalFilePath, fileType);
            }

            const fileRecord: RecordedFile = {
                id: fileId,
                name: file.name,
                filePath: finalFilePath,
                contentPath: contentFilePath,
                uploadedAt: new Date().toISOString(),
                contentHash,
                embeddingModel: embeddingModelKey,
                chunkSize: UploadManager.chunkSize,
                chunkOverlap: UploadManager.chunkOverlap,
                fileType: fileType,
            }

            UploadManager.addNewRecordedFile(fileRecord);

            processedFiles.push({
                fileExtension: fileExtension || '',
                fileId,
                fileName: file.name
            });
        }))

        return processedFiles;
    }
}

export default UploadManager;
