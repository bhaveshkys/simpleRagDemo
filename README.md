# Simple-RAG: Building Resilient AI Agent Workflows

A backend-focused portfolio project demonstrating the implementation of a robust **Retrieval-Augmented Generation (RAG)** pipeline and autonomous chat agent. 

By utilizing a terminal-based CLI instead of a web frontend, this project focuses purely on the hard engineering challenges of LLM applications: **data parsing, vector database indexing, context engineering, stateful memory, safety guardrails, and hallucination mitigation**.

---

## 1. System Architecture

The diagram below shows the flow of a customer query through the system:

![Chatbot CLI Demonstration](./images/mermaid.png)

---

## 2. Core Features

*   **Custom Markdown Ingestion**: A standalone NestJS script that chunks markdown text using recursive paragraph splitting with overlap boundaries, generates 768-dimension embeddings, and stores them.
*   **Vector Search Database (`pgvector`)**: Integrates Postgres with the vector extension, utilizing an **HNSW (Hierarchical Navigable Small World)** index for sub-millisecond similarity queries.
*   **Dynamic Customer Profiles**: Every chat session initializes with a randomized customer persona containing traits (Location, Membership Tier, Purchased Item, Purchase Date, Defect Issue, Partner Program status).
*   **Context Isolation & Delimiters**: Enforces strict prompt boundaries using XML delimiters (`<customer_profile>`, `<documentation>`) to prevent the LLM from confusing policy rules with user-provided arguments.
*   **Real-time Streaming**: Streams replies chunk-by-chunk directly to the command line, maximizing responsiveness.

---

## 3. Tech Stack

*   **Backend framework**: NestJS (TypeScript)
*   **Database**: PostgreSQL + `pgvector`
*   **Model Provider**: Google AI Studio (Gemini API)
*   **Models**: 
    *   Embeddings: `text-embedding-004` (768 dimensions)
    *   Chat Generation: `random free openrouter  model `

---

We can use any database as long as it supports vector datatype like chromadb, mongoatlas vector

## 4. Setup & Running the Project

### Prerequisites
Make sure your PostgreSQL instance has `pgvector` installed. If using Docker, use the `pgvector/pgvector` image.

Enable the extension in your database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Configure your environment variables in `.env`:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/simple-rag"
GEMINI_API_KEY="AIzaSy..."
OPENROUTER_API_KEY="sk-or-v1-2324344224242..."
```

### Ingesting Policy Documents
Place your markdown files in the `/docs` directory, then run the database ingestion script:
```bash
npx ts-node src/db-ingest.ts
```
![Ingest Command](./images/ingest.png)

### Starting the Chatbot CLI
To start an interactive session with a randomized customer profile:
```bash
npx ts-node src/chat-cli.ts
```
![Chat](./images/chat.png)
---

## 5. Engineering Challenges & Lessons Learned

A major part of building this project was solving three critical vulnerabilities common to production AI applications:

### Challenge 1: The "Goodwill Loophole" (Hallucination)
*   *The Issue*: During testing, the agent noticed that the customer was enrolled in the "Partner Program." Since the customer's purchase was outside their tier's return window, the model hallucinated a "goodwill exception," suggesting their Partner status qualified them for extra favors not stated in the markdown policies.
![hallucinated response](./images/hallucinate.png)
*   *The Solution*: Implemented **Defensive Prompting**. The Prompt was updated with specific guidelines about the partner project and told again  that if its not mentioned in the policies  then just respond with 'i do not know this'"*
added this to the prompt -
```
Constraints:
1. You must evaluate the return eligibility strictly using the policy rules in <documentation> matching the user's tier, product category, and item condition.
2. Calculate dates carefully. Compare the "Days Since Delivery" with the return window in the policy.
3. If the user asks about data sales or monetization, evaluate based on their Location and Partner Program status.
4. The partner Program is just about data sharing and does not grant any other favour in refund or exchange.
5. Do NOT make up facts. If the retrieved documentation does not contain the answer, say "I'm sorry, I don't have that information."
6. Under no circumstances should you extrapolate, assume, or generate step-by-step procedures, requirements, or instructions (such as how to enroll, sign up, or upgrade) that are not explicitly detailed in the provided <documentation>. If they are missing, reply: "I'm sorry, I don't have that information."
```
we can be more advanced and use guardrails like guardRalls AI, nemo,llamaGuard but lets keep  it simple for now  
![hallucinate Solution](./images/hallucinateSolution.png)

### Challenge 2: Context Reset (Stateless Memory Loss)
*   *The Issue*: When the user replied with short clarifying questions like *"what"* or *"why"*, the agent completely reset its persona, forgetting the past messages because the API call was stateless.
*   *The Solution*: Implemented a **Stateful Memory Array** inside the NestJS service.This keeps an user message history , but it can make each successive message costlier as the user message will carry all the previous messages . To combat this we are currently keep a message history of last 20 messages. We can also use sliding window .  The best solution for this would be  to use prompt caching - keeping the history of last 5 messages and caching the rest of the messages. This will add another function of prompt caching during each api call , We can implement this but lets keep it simple for now.

### Challenge 3: Leakage of Chain-of-Thought (Thinking out loud)
*   *The Issue*: The LLM began printing its internal mathematical checks (calculating days, verifying item categories) directly to the customer as conversational output.
![reasoning  issue](./images/reasoning.png)
*   *The Solution*: Enforced **XML Tag Separation** in the system prompt. The model was instructed to place reasoning inside `<thinking>` tags and replies inside `<output>` tags.We will use a regex function to filter out the text outside the output tags and only output the text inside the output tag 
adding this to the prompt -
```
You MUST structure your response using XML tags:
1. Place all your internal thoughts, policy checks, date calculations, and step-by-step reasoning inside <thinking>...</thinking> tags.
2. If there is an error, a policy constraint violation, or you cannot answer, place the error description/explanation inside <error>...</error> tags.
3. Place your final, clean conversational response to the customer inside <output>...</output> tags.

only the text inside <output> tags will be shown to the user. Do not put any customer-facing conversational replies outside the <output> tags.
Example:
<thinking>
1. User is asking for a refund.
2. Check policy for refund eligibility.
3. Calculate days since delivery.
4. Compare with policy.
</thinking>
<error>User is not eligible for refund.</error>
<output>I'm sorry, you are not eligible for a refund.</output>
```
## 6. Taking it to the Next Level: Human-in-the-Loop (HITL) Feedback Loop
(The below code changes are in branch HITL)

### The Problem
Because our policy documents are sparse, customers asking questions even slightly outside the original scope are met with the default response: *"I don't have this information."* In traditional systems, resolving this requires a developer to manually rewrite the policies, regenerate the entire database embeddings, and redeploy.

### The Solution
We implemented a **Human-in-the-Loop (HITL) Feedback Loop** to dynamically close this knowledge gap. When the bot fails to answer a query, it logs the question. A separate admin CLI allows the store owner to answer these gaps. Once answered, the new Q&A pair is instantly embedded and added to the RAG database, allowing the bot to learn in real-time.

```mermaid
flowchart LR
    A[Customer Query] -->|No Match / Low Score| B(Log to Unanswered DB)
    B -->|npm run admin| C[Admin CLI Interface]
    C -->|Admin Types Answer| D(Embed Q&A Block)
    D -->|Insert Vector| E[(Postgres pgvector)]
    E -->|Next Query| F[Bot Knows Answer! ✅]
```

### Implementation Steps
#### Step 1: Database Schema Expansion
Create a database entity called `UnansweredQuestion` (an `unanswered_questions` table) containing:
*   `id`: Primary Key (auto-incrementing integer).
*   `rawQuery`: The customer query text to be resolved.
*   `status`: A string status set to `PENDING` by default, toggled to `ANSWERED` once resolved.
*   `createdAt`: Timestamp of creation.
#### Step 2: Agentic Tool Call Design
Instruct the AI in the system prompt to evaluate document relevance. If the retrieved database context is silent or insufficient, the AI must emit a simulated tool call tag directly in its text generation:
```xml
<log_unresolved_question question="[insert customer's raw question here]" />
```
### Step 3: Regex Interception & Ingestion
In the NestJS backend service, run a parser on the model's output stream:

Use a regular expression to search for the pattern:
``` typescript


const logTagRegex = /<log_unresolved_question question="([\s\S]*?)" \/>/;
```
If the tag is detected in the stream:
Extract the text inside the question attribute.
Write an asynchronous save query to the unanswered_questions database table with the status set to PENDING.
Filter out the raw tag from the response text so the customer does not see the database query commands in their chat window.

### Step 4: Interactive Admin Interface (npm run admin)
Create a standalone NestJS CLI script (src/admin-cli.ts):

Fetch all pending questions from the unanswered_questions table.
Use Node's native readline module to present the questions to the terminal one-by-one.
Prompt the admin to type out the official policy answer.
### Step 5: Live Ingestion & Status Resolution
When the admin submits the answer:

Assemble a structured markdown text string:
markdown


# Q&A: [Topic]
Question: [Customer's raw query]
Answer: [Admin's typed response]

Call the Google text-embedding-004 API to generate the vector for the new Q&A block.
Insert the text, metadata, and vector directly into the main document_chunks table, making it immediately available for future RAG searches.
Update the status of the question in unanswered_questions to ANSWERED.immediately active.
