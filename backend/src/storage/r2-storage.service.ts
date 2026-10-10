import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly expiresIn: number;

  // R2 is optional outside production; the client is only required when a
  // resume is actually stored or read.
  constructor(config: ConfigService) {
    const endpoint = config.get<string>('R2_ENDPOINT');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    this.client =
      endpoint && accessKeyId && secretAccessKey
        ? new S3Client({
            region: 'auto',
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
    this.bucket = config.get<string>('R2_BUCKET_NAME');
    this.expiresIn = config.get<number>('R2_PRESIGNED_URL_EXPIRY', 3600);
  }

  private requireClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new Error('R2 storage is not configured (R2_* variables missing)');
    }
    return { client: this.client, bucket: this.bucket };
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const { client, bucket } = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getPresignedUrl(key: string): Promise<string> {
    const { client, bucket } = this.requireClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: this.expiresIn },
    );
  }
}
