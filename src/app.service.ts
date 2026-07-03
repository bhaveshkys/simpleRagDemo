import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DocumentChunk } from './document/document.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { CustomerProfile } from './customer-profile';
import { OpenAI } from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectRepository(DocumentChunk)
    private readonly documentRepository: Repository<DocumentChunk>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async ingestDocuments(): Promise<void> {
    const docsDir = path.resolve(process.cwd(), 'docs');
    this.logger.log(`Starting ingestion from directory: ${docsDir}`);

    // Check if directory exists
    try {
      await fs.access(docsDir);
    } catch {
      throw new Error(`Directory not found: ${docsDir}`);
    }

    const files = await fs.readdir(docsDir);
    const mdFiles = files.filter(
      (f) => f.endsWith('.md') || f.endsWith('.txt'),
    );

    if (mdFiles.length === 0) {
      this.logger.warn(`No markdown or text files found in ${docsDir}`);
      return;
    }

    // Initialize Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not defined in the environment variables.',
      );
    }
    const ai = new GoogleGenAI({ apiKey });

    // Clear existing chunks to avoid duplication on re-run
    this.logger.log('Clearing existing document chunks...');
    await this.documentRepository.clear();

    for (const file of mdFiles) {
      const filePath = path.join(docsDir, file);
      const text = await fs.readFile(filePath, 'utf-8');

      this.logger.log(`Processing file: ${file}`);
      const chunks = this.chunkText(text, 1000, 150);
      this.logger.log(`Split ${file} into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        this.logger.log(
          `Generating embedding for chunk ${i + 1}/${chunks.length}...`,
        );

        try {
          const response = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: chunkText,
            config: {
              outputDimensionality: 768,
            },
          });

          const values = response.embeddings?.[0]?.values;
          if (!values || values.length === 0) {
            throw new Error(
              `Failed to generate embedding values for chunk ${i}`,
            );
          }

          const documentChunk = new DocumentChunk();
          documentChunk.title = file;
          documentChunk.content = chunkText;
          documentChunk.metadata = {
            filename: file,
            chunkIndex: i,
            totalChunks: chunks.length,
          };
          documentChunk.embedding = values;

          await this.documentRepository.save(documentChunk);
        } catch (err) {
          this.logger.error(
            `Error processing chunk ${i} of file ${file}:`,
            err,
          );
          throw err;
        }
      }
    }
    this.logger.log('Ingestion completed successfully!');
  }

  private chunkText(
    text: string,
    chunkSize = 1000,
    chunkOverlap = 150,
  ): string[] {
    const chunks: string[] = [];
    let startIndex = 0;
    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      let chunk = text.substring(startIndex, endIndex);

      if (endIndex < text.length) {
        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > 0) {
          chunk = chunk.substring(0, lastSpace);
        }
      }

      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        chunks.push(trimmed);
      }
      startIndex += chunk.length - chunkOverlap;

      if (chunk.length <= chunkOverlap) {
        startIndex += chunkSize;
      }
    }
    return chunks;
  }

  async getChatResponseStream(
    userInput: string,
    profile: CustomerProfile,
    history: ChatMessage[],
    callback: (chunk: string) => void,
  ): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
    }
    const ai = new GoogleGenAI({ apiKey });

    // 1. Embed the user query
    let queryEmbedding: number[] = [];
    try {
      const embedResponse = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: userInput,
        config: {
          outputDimensionality: 768,
        },
      });
      const values = embedResponse.embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error('Failed to embed user input.');
      }
      queryEmbedding = values;
    } catch (err) {
      this.logger.error('Error generating query embedding:', err);
      callback("I'm sorry, I encountered an issue generating embeddings for your query.");
      return;
    }

    // 2. Fetch context from Postgres
    let retrievedDocs: string[] = [];
    try {
      const similarChunks = await this.findSimilarChunks(queryEmbedding, 3);
      retrievedDocs = similarChunks.map(c => `[Source File: ${c.title}]\n${c.content}`);
    } catch (err) {
      this.logger.error('Error querying database for similar chunks:', err);
      callback("I'm sorry, I had trouble searching my database for documents.");
      return;
    }

    // 3. Construct system prompt
    const systemPrompt = await this.buildAgentPrompt(retrievedDocs, profile);

    // 4. Generate content stream using OpenRouter
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      this.logger.error('OPENROUTER_API_KEY is not defined in the environment variables.');
      callback("I'm sorry, I'm missing the required API credentials to generate a chat response.");
      return;
    }

    const openrouterModel = process.env.OPENROUTER_MODEL || 'openrouter/free';
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Simple RAG Support Chatbot',
      },
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userInput },
    ];

    let rawBuffer = '';
    let printedLength = 0;

    try {
      const responseStream = await openai.chat.completions.create({
        model: openrouterModel,
        messages: messages as any,
        stream: true,
      });

      for await (const chunk of responseStream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          rawBuffer += text;

          let extracted = '';
          const matches = [...rawBuffer.matchAll(/<output>([\s\S]*?)(?:<\/output>|$)/g)];
          for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            let content = match[1];

            const isLast = i === matches.length - 1;
            const matchedAll = match[0].endsWith('</output>');
            if (isLast && !matchedAll) {
              const closeTag = '</output>';
              for (let j = 1; j < closeTag.length; j++) {
                const prefix = closeTag.substring(0, j);
                if (content.endsWith(prefix)) {
                  content = content.substring(0, content.length - prefix.length);
                  break;
                }
              }
            }
            extracted += content;
          }

          if (extracted.length > printedLength) {
            const toPrint = extracted.substring(printedLength);
            callback(toPrint);
            printedLength = extracted.length;
          }
        }
      }

      // Safe fallback if the model completely forgot to use <output> tags
      if (printedLength === 0 && rawBuffer.trim().length > 0) {
        let fallback = rawBuffer.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/g, '');
        fallback = fallback.replace(/<error>[\s\S]*?(?:<\/error>|$)/g, '');
        fallback = fallback.replace(/<[^>]*>/g, ''); // strip any remaining XML tags
        const cleaned = fallback.trim();
        if (cleaned.length > 0) {
          callback(cleaned);
        }
      }
    } catch (err) {
      this.logger.error('Error generating chat response stream via OpenRouter:', err);
      callback("\n[Error occurred during stream generation.]");
    }
  }

  async findSimilarChunks(queryEmbedding: number[], limit = 3): Promise<DocumentChunk[]> {
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    return this.documentRepository
      .createQueryBuilder('chunk')
      .orderBy('chunk.embedding <=> :embeddingString')
      .setParameter('embeddingString', embeddingString)
      .limit(limit)
      .getMany();
  }

  private async buildAgentPrompt(
    retrievedDocs: string[],
    profile: CustomerProfile
  ): Promise<string> {
    return `
Role: You are an AuraShop customer support agent. Be helpful, professional, and concise.

You MUST structure your response using XML tags:
1. Place all your internal thoughts, policy checks, date calculations, and step-by-step reasoning inside <thinking>...</thinking> tags.
2. If there is an error, a policy constraint violation, or you cannot answer, place the error description/explanation inside <error>...</error> tags.
3. Place your final, clean conversational response to the customer inside <output>...</output> tags.

Only the text inside <output> tags will be shown to the user. Do not put any customer-facing conversational replies outside the <output> tags.
Example:
<thinking>
1. User is asking for a refund.
2. Check policy for refund eligibility.
3. Calculate days since delivery.
4. Compare with policy.
</thinking>
<error>User is not eligible for refund.</error>
<output>I'm sorry, you are not eligible for a refund.</output>

Here is the profile of the customer you are currently chatting with:
<customer_profile>
Location: ${profile.location}
Membership Tier: ${profile.tier}
Purchased Item: ${profile.purchasedItem} (Category: ${profile.itemCategory})
Days Since Delivery: ${profile.daysSinceDelivery} days
Item Condition/Issue: ${profile.itemIssue}
Partner Program Enrollment: ${profile.enrolledInPartnerProgram ? 'YES' : 'NO'}
</customer_profile>

Here is the relevant store documentation retrieved from our database:
<documentation>
${retrievedDocs.join('\n\n')}
</documentation>

Constraints:
1. You must evaluate the return eligibility strictly using the policy rules in <documentation> matching the user's tier, product category, and item condition.
2. Calculate dates carefully. Compare the "Days Since Delivery" with the return window in the policy.
3. If the user asks about data sales or monetization, evaluate based on their Location and Partner Program status.
4. The partner Program is just about data sharing and does not grant any other favour in refund or exchange 
5. Do NOT make up facts. If the retrieved documentation does not contain the answer, say "I'm sorry, I don't have that information."
6. Under no circumstances should you extrapolate, assume, or generate step-by-step procedures, requirements, or instructions (such as how to enroll, sign up, or upgrade) that are not explicitly detailed in the provided <documentation>. If they are missing, reply: "I'm sorry, I don't have that information."`;
  }
}
