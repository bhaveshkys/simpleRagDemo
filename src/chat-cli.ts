import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService, ChatMessage } from './app.service';
import { generateRandomProfile } from './customer-profile';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const appService = app.get(AppService);

  // 1. Generate active customer profile
  const profile = generateRandomProfile();

  const history: ChatMessage[] = [];

  console.clear();
  console.log('==================================================');
  console.log('       AuraShop Customer Service Chatbot CLI       ');
  console.log('==================================================');
  console.log('Active Customer Profile:');
  console.log(`- Name:      ${profile.name}`);
  console.log(`- Tier:      ${profile.tier}`);
  console.log(`- Location:  ${profile.location}`);
  console.log(`- Item:      ${profile.purchasedItem} (${profile.itemCategory})`);
  console.log(`- Purchase Date: ${profile.purchaseDate}`);
  console.log(`- Delivered: ${profile.daysSinceDelivery} days ago`);
  console.log(`- Issue:     ${profile.itemIssue}`);
  console.log(`- Partner:   ${profile.enrolledInPartnerProgram ? 'Yes' : 'No'}`);
  console.log('==================================================\n');
  console.log('Type "exit" to close the application.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const chatLoop = () => {
    rl.question('\nYou: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        rl.close();
        await app.close();
        console.log('Chat session ended.');
        return;
      }

      if (!userInput.trim()) {
        chatLoop();
        return;
      }

      process.stdout.write('Agent: ');

      // 2. Fetch context, build prompt, and call Gemini API (streaming response to stdout)
      let fullResponse = '';
      try {
        await appService.getChatResponseStream(userInput, profile, history, (chunk) => {
          process.stdout.write(chunk);
          fullResponse += chunk;
        });

        history.push({ role: 'user', content: userInput });
        history.push({ role: 'assistant', content: fullResponse });

        // Limit the history to the last 20 messages (10 turns) to avoid exceeding context window limits
        const MAX_HISTORY = 20;
        if (history.length > MAX_HISTORY) {
          history.splice(0, history.length - MAX_HISTORY);
        }
      } catch (error) {
        console.error('\nError during streaming chat response:', error);
      }
      console.log();
      chatLoop();
    });
  };

  chatLoop();
}

bootstrap().catch((err) => {
  console.error('Failed to start chatbot CLI:', err);
  process.exit(1);
});
