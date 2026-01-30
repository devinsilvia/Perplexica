import { NextResponse } from 'next/server';
import UploadManager from '@/lib/uploads/manager';
import fs from 'fs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;

  if (!fileId) {
    return NextResponse.json({ message: 'Missing file id.' }, { status: 400 });
  }

  const record = UploadManager.getFile(fileId);

  if (!record || !fs.existsSync(record.filePath)) {
    return NextResponse.json({ message: 'File not found.' }, { status: 404 });
  }

  const safeName = record.name.replace(/"/g, '');
  const fileBuffer = fs.readFileSync(record.filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': record.fileType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
    },
  });
}
