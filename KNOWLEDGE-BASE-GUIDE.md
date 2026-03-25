# Adding Documents to the Knowledge Base

This guide explains how to add documents to your Bedrock Knowledge Base for RAG (Retrieval-Augmented Generation).

## Your Knowledge Base Configuration

```bash
Knowledge Base ID: CULUCCLYLB
Data Source ID: 5KR2YVSSTO
S3 Bucket: agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq
Region: us-east-1
```

## Quick Start

### Method 1: Using AWS CLI (Recommended)

```bash
# 1. Upload documents to S3
aws s3 cp your-document.pdf s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/

# 2. Start ingestion job
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO

# 3. Check ingestion status
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO \
  --ingestion-job-id <JOB_ID_FROM_STEP_2>
```

### Method 2: Using AWS Console

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Navigate to **Knowledge bases** → **AgentCoreKnowledgeBaseV2**
3. Click **Data source** → **Sync data source**
4. Upload files or sync from S3

### Method 3: Bulk Upload Script

```bash
bash upload-to-knowledge-base.sh /path/to/your/documents/
```

## Supported File Types

The Knowledge Base supports:
- ✅ **PDF** - Adobe Portable Document Format
- ✅ **TXT** - Plain text files
- ✅ **MD** - Markdown files
- ✅ **HTML** - Web pages
- ✅ **DOC/DOCX** - Microsoft Word documents
- ✅ **CSV** - Comma-separated values

### File Size Limits
- Maximum file size: **50 MB**
- Maximum total storage: **10 GB** (can be increased)
- Recommended file size: **5-10 MB** for optimal processing

## Step-by-Step Guide

### Step 1: Prepare Your Documents

Organize your documents in a folder:

```
documents/
├── aws-lambda-guide.pdf
├── serverless-best-practices.md
├── architecture-overview.txt
└── api-documentation.html
```

### Step 2: Upload to S3

**Option A: Single File**
```bash
aws s3 cp document.pdf s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/
```

**Option B: Multiple Files**
```bash
aws s3 cp documents/ s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/ --recursive
```

**Option C: From a URL**
```bash
wget https://example.com/document.pdf
aws s3 cp document.pdf s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/
```

### Step 3: Start Ingestion

Start the ingestion job to process and index documents:

```bash
INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO \
  --output json)

echo "Ingestion job started!"
JOB_ID=$(echo $INGESTION_JOB | jq -r '.ingestionJob.ingestionJobId')
echo "Job ID: $JOB_ID"
```

### Step 4: Monitor Progress

Check the status of the ingestion job:

```bash
# Replace <JOB_ID> with the actual job ID from step 3
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO \
  --ingestion-job-id <JOB_ID> \
  --query 'ingestionJob.status' \
  --output text
```

**Status values:**
- `STARTING` - Job is initializing
- `IN_PROGRESS` - Processing documents
- `COMPLETE` - Successfully indexed
- `FAILED` - Error occurred (check logs)

### Step 5: Verify Documents

List all ingestion jobs:

```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO \
  --max-results 10
```

Check what's in the S3 bucket:

```bash
aws s3 ls s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/ --recursive
```

## Automated Upload Script

I'll create a script for you to automate this process:

**File: `upload-to-knowledge-base.sh`**

```bash
#!/bin/bash

BUCKET="agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq"
KB_ID="CULUCCLYLB"
DS_ID="5KR2YVSSTO"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <file-or-directory>"
  echo "Example: $0 documents/"
  echo "Example: $0 my-document.pdf"
  exit 1
fi

INPUT=$1

echo "📤 Uploading to Knowledge Base..."
echo "Bucket: $BUCKET"
echo ""

# Upload to S3
if [ -d "$INPUT" ]; then
  echo "Uploading directory: $INPUT"
  aws s3 cp "$INPUT" "s3://$BUCKET/documents/" --recursive
else
  echo "Uploading file: $INPUT"
  aws s3 cp "$INPUT" "s3://$BUCKET/documents/"
fi

echo ""
echo "✅ Upload complete!"
echo ""
echo "🔄 Starting ingestion job..."

# Start ingestion
JOB_RESPONSE=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID \
  --output json)

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.ingestionJob.ingestionJobId')

echo "✅ Ingestion job started!"
echo "Job ID: $JOB_ID"
echo ""
echo "📊 Monitoring progress..."

# Monitor progress
while true; do
  STATUS=$(aws bedrock-agent get-ingestion-job \
    --knowledge-base-id $KB_ID \
    --data-source-id $DS_ID \
    --ingestion-job-id $JOB_ID \
    --query 'ingestionJob.status' \
    --output text)
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "COMPLETE" ]; then
    echo ""
    echo "✅ Ingestion complete! Documents are now available in the knowledge base."
    
    # Get statistics
    STATS=$(aws bedrock-agent get-ingestion-job \
      --knowledge-base-id $KB_ID \
      --data-source-id $DS_ID \
      --ingestion-job-id $JOB_ID \
      --query 'ingestionJob.statistics' \
      --output json)
    
    echo ""
    echo "Statistics:"
    echo $STATS | jq '.'
    
    exit 0
  elif [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo "❌ Ingestion failed. Check CloudWatch logs for details."
    exit 1
  fi
  
  sleep 5
done
```

## Testing Your Knowledge Base

After documents are ingested, test them:

### Method 1: Using REST Client (api-tests.http)

```http
### Query Knowledge Base
POST {{apiEndpoint}}/api/knowledge-base/query
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "query": "What information do you have about AWS Lambda?",
  "maxResults": 5
}
```

### Method 2: Using Chat API

```http
### Chat with Knowledge Base
POST {{apiEndpoint}}/api/chat/invoke
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "message": "Search the knowledge base for information about serverless architecture"
}
```

### Method 3: Using AWS CLI

```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id CULUCCLYLB \
  --retrieval-query "text=What is AWS Lambda?" \
  --retrieval-configuration "{\"vectorSearchConfiguration\":{\"numberOfResults\":5}}"
```

## Best Practices

### 1. Document Preparation
- ✅ Use clear, descriptive filenames
- ✅ Include metadata in document headers
- ✅ Break large documents into smaller chunks
- ✅ Use consistent formatting
- ✅ Remove sensitive information

### 2. Organization
```
s3://bucket/documents/
├── aws/
│   ├── lambda-guide.pdf
│   ├── ec2-guide.pdf
│   └── s3-guide.pdf
├── architecture/
│   ├── microservices.md
│   └── event-driven.md
└── best-practices/
    ├── security.pdf
    └── performance.pdf
```

### 3. Naming Conventions
- Use lowercase and hyphens: `aws-lambda-guide.pdf`
- Include dates for versioned docs: `api-spec-2026-03.pdf`
- Be descriptive: `serverless-architecture-patterns.md`

### 4. Update Strategy
```bash
# 1. Upload new/updated documents
aws s3 sync ./local-docs/ s3://$BUCKET/documents/

# 2. Trigger re-ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

## Troubleshooting

### Issue: Ingestion Job Fails

**Check CloudWatch Logs:**
```bash
aws logs filter-log-events \
  --log-group-name /aws/bedrock/knowledgebases/CULUCCLYLB \
  --start-time $(($(date +%s) - 3600))000
```

**Common causes:**
- File size too large (>50 MB)
- Unsupported file format
- Corrupted file
- S3 permissions issue

### Issue: Documents Not Found in Queries

**Verify ingestion completed:**
```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO
```

**Test direct retrieval:**
```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id CULUCCLYLB \
  --retrieval-query "text=test query"
```

### Issue: Slow Ingestion

- **Reduce file size**: Break large PDFs into smaller documents
- **Optimize images**: Compress images in PDFs
- **Parallel uploads**: Upload multiple files simultaneously
- **Monitor quotas**: Check Bedrock service quotas

## Advanced Features

### Custom Metadata

Add metadata to documents for better filtering:

```bash
aws s3 cp document.pdf s3://$BUCKET/documents/ \
  --metadata "category=technical,topic=serverless,version=2.0"
```

### Chunking Strategy

The Knowledge Base automatically chunks documents. Default settings:
- **Max chunk size**: 300 tokens (~225 words)
- **Overlap**: 20% between chunks
- **Strategy**: Semantic chunking (respects paragraphs)

### Vector Embeddings

Your Knowledge Base uses:
- **Model**: `amazon.titan-embed-text-v1`
- **Dimensions**: 1536
- **Vector DB**: Aurora PostgreSQL with pgvector

## Costs

Approximate costs for document ingestion:

| Operation | Cost |
|-----------|------|
| Embedding generation | $0.0001 per 1K tokens |
| S3 storage | $0.023 per GB/month |
| Aurora storage | $0.10 per GB/month |
| Retrieval queries | $0.0004 per 1K tokens |

**Example:** 100 documents (5 MB each) ≈ $0.50 one-time + $2/month storage

## Next Steps

1. ✅ Upload your first document
2. ✅ Start an ingestion job
3. ✅ Test retrieval using the chat API
4. ✅ Monitor query performance
5. ✅ Add more documents as needed

## Quick Reference Commands

```bash
# Upload single file
aws s3 cp file.pdf s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/

# Upload directory
aws s3 sync ./docs/ s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/

# Start ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO

# Check status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO \
  --max-results 5

# List files
aws s3 ls s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/ --recursive

# Delete a file
aws s3 rm s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/documents/file.pdf
```

## Support

For issues:
- Check [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- Review CloudWatch logs for detailed errors
- Verify S3 bucket permissions
- Ensure Knowledge Base is active
