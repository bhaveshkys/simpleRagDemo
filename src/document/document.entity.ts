// src/ingestion/document-chunk.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  title: string;

  @Column('text')
  content: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  // Specify the custom type 'vector' and length (768 for Google v4)
  @Column('vector', { length: 768 })
  embedding: number[];
}