import { randomUUID } from "node:crypto";
import path from "node:path";

export type RegisteredImage = {
  id: string;
  uri: string;
  absPath: string;
  name: string;
  mimeType: string;
};

export function resourceUri(id: string): string {
  return `gen-image:///${id}`;
}

// 仅登记当前服务实例保存的文件；资源 URI 使用 UUID，不接受任意文件路径。
export class ImageRegistry {
  private readonly items = new Map<string, RegisteredImage>();

  register(
    absPath: string,
    mimeType: string,
    id = randomUUID(),
  ): RegisteredImage {
    const item: RegisteredImage = {
      id,
      uri: resourceUri(id),
      absPath,
      name: path.basename(absPath),
      mimeType,
    };
    this.items.set(id, item);
    return item;
  }

  list(): RegisteredImage[] {
    return [...this.items.values()];
  }

  get(id: string): RegisteredImage | undefined {
    return this.items.get(id);
  }
}
