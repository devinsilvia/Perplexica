import { Chunk } from '@/lib/types';

abstract class BaseEmbedding<CONFIG> {
  constructor(protected config: CONFIG) {}
  abstract embedText(texts: string[]): Promise<number[][]>;
  abstract embedChunks(chunks: Chunk[]): Promise<number[][]>;

  getCacheKey(): string {
    const model = (this.config as { model?: string } | undefined)?.model;
    const provider = this.constructor?.name || 'Embedding';
    return model ? `${provider}:${model}` : provider;
  }
}

export default BaseEmbedding;
