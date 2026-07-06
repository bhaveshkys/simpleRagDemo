import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const appService = app.get(AppService);

  console.clear();
  console.log('==================================================');
  console.log('       AuraShop Customer Service Admin CLI        ');
  console.log('==================================================');

  // Fetch all unresolved questions
  const unresolvedList = await appService.getUnresolvedQuestions();

  if (unresolvedList.length === 0) {
    console.log('\nNice! No unresolved customer questions in the database.');
    console.log('All clear.\n');
    await app.close();
    process.exit(0);
  }

  console.log(
    `Found ${unresolvedList.length} unresolved customer question(s).\n`,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const questionIterator = async (index: number) => {
    if (index >= unresolvedList.length) {
      console.log('\nAll unresolved questions processed. Exit CLI.');
      rl.close();
      await app.close();
      return;
    }

    const questionItem = unresolvedList[index];
    console.log('--------------------------------------------------');
    console.log(`[Question ${index + 1}/${unresolvedList.length}]`);
    console.log(`Question text: "${questionItem.question}"`);
    console.log('--------------------------------------------------');

    const askAnswer = () => {
      rl.question(
        'Admin Answer (or type "skip" / "delete"): ',
        (answerInput) => {
          (async () => {
            const cleanedInput = answerInput.trim();

            if (!cleanedInput) {
              askAnswer();
              return;
            }

            if (cleanedInput.toLowerCase() === 'skip') {
              console.log('Skipping question...');
              await questionIterator(index + 1);
              return;
            }

            if (cleanedInput.toLowerCase() === 'delete') {
              try {
                await appService.deleteQuestion(questionItem.id);
                console.log('Question deleted successfully.');
              } catch (err) {
                console.error('Failed to delete question:', err);
              }
              await questionIterator(index + 1);
              return;
            }

            // It is an answer!
            console.log('Processing answer and generating embedding...');
            try {
              // Generate embedding, save as DocumentChunk
              await appService.ingestAdminAnswer(
                questionItem.question,
                cleanedInput,
              );
              // Mark unresolved question as resolved
              await appService.resolveQuestion(questionItem.id);
              console.log('Successfully ingested QA pair to vector database!');
            } catch (err) {
              console.error('Failed to ingest admin answer:', err);
            }

            await questionIterator(index + 1);
          })().catch((err) => {
            console.error('Error handling admin input:', err);
          });
        },
      );
    };

    askAnswer();
  };

  await questionIterator(0);
}

bootstrap().catch((err) => {
  console.error('Failed to start admin CLI:', err);
  process.exit(1);
});
