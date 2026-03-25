#!/bin/bash

# Knowledge Base Document Upload Script
# Automatically uploads documents to S3 and triggers ingestion

set -e

BUCKET="agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq"
KB_ID="CULUCCLYLB"
DS_ID="5KR2YVSSTO"
REGION="us-east-1"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Knowledge Base Document Upload & Ingestion Tool         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if input provided
if [ $# -eq 0 ]; then
  echo -e "${RED}Error: No input provided${NC}"
  echo ""
  echo "Usage:"
  echo "  $0 <file-or-directory>"
  echo ""
  echo "Examples:"
  echo "  $0 document.pdf                    # Upload single file"
  echo "  $0 documents/                      # Upload entire directory"
  echo "  $0 https://example.com/doc.pdf     # Download and upload from URL"
  echo ""
  exit 1
fi

INPUT=$1

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  S3 Bucket: $BUCKET"
echo "  Knowledge Base: $KB_ID"
echo "  Data Source: $DS_ID"
echo "  Region: $REGION"
echo ""

# Handle URL input
if [[ $INPUT == http* ]]; then
  echo -e "${BLUE}🌐 Downloading from URL...${NC}"
  FILENAME=$(basename "$INPUT")
  wget -q "$INPUT" -O "$FILENAME"
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Downloaded: $FILENAME${NC}"
    INPUT="$FILENAME"
  else
    echo -e "${RED}❌ Failed to download from URL${NC}"
    exit 1
  fi
fi

# Check if input exists
if [ ! -e "$INPUT" ]; then
  echo -e "${RED}❌ Error: '$INPUT' not found${NC}"
  exit 1
fi

# Upload to S3
echo -e "${BLUE}📤 Uploading to S3...${NC}"

if [ -d "$INPUT" ]; then
  # Directory upload
  FILE_COUNT=$(find "$INPUT" -type f | wc -l)
  echo "  Uploading directory with $FILE_COUNT files..."
  
  aws s3 cp "$INPUT" "s3://$BUCKET/documents/" --recursive --region $REGION
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Successfully uploaded $FILE_COUNT files${NC}"
  else
    echo -e "${RED}❌ Upload failed${NC}"
    exit 1
  fi
else
  # Single file upload
  FILENAME=$(basename "$INPUT")
  echo "  Uploading: $FILENAME"
  
  aws s3 cp "$INPUT" "s3://$BUCKET/documents/$FILENAME" --region $REGION
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Successfully uploaded: $FILENAME${NC}"
  else
    echo -e "${RED}❌ Upload failed${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${BLUE}🔄 Starting ingestion job...${NC}"

# Start ingestion job
JOB_RESPONSE=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID \
  --region $REGION \
  --output json 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to start ingestion job${NC}"
  echo "$JOB_RESPONSE"
  exit 1
fi

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.ingestionJob.ingestionJobId')

echo -e "${GREEN}✅ Ingestion job started!${NC}"
echo "  Job ID: $JOB_ID"
echo ""

# Monitor progress
echo -e "${BLUE}📊 Monitoring ingestion progress...${NC}"
echo ""

DOTS=0
while true; do
  JOB_STATUS=$(aws bedrock-agent get-ingestion-job \
    --knowledge-base-id $KB_ID \
    --data-source-id $DS_ID \
    --ingestion-job-id $JOB_ID \
    --region $REGION \
    --output json 2>&1)
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to get job status${NC}"
    exit 1
  fi
  
  STATUS=$(echo $JOB_STATUS | jq -r '.ingestionJob.status')
  
  # Clear line and show status with animation
  printf "\r  Status: %-15s %s" "$STATUS" "$(printf '.%.0s' $(seq 1 $DOTS))"
  DOTS=$(( (DOTS + 1) % 4 ))
  
  if [ "$STATUS" = "COMPLETE" ]; then
    echo ""
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ✅ Ingestion Complete!                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Extract and display statistics
    STATS=$(echo $JOB_STATUS | jq '.ingestionJob.statistics')
    
    if [ "$STATS" != "null" ]; then
      echo -e "${BLUE}📊 Statistics:${NC}"
      echo "$STATS" | jq -r 'to_entries[] | "  \(.key): \(.value)"'
      echo ""
    fi
    
    echo -e "${GREEN}✅ Documents are now available in the knowledge base!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Test via chat API: POST /api/chat/invoke"
    echo "  2. Query directly: POST /api/knowledge-base/query"
    echo "  3. View in AWS Console: Bedrock → Knowledge bases → AgentCoreKnowledgeBaseV2"
    echo ""
    
    exit 0
    
  elif [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                ❌ Ingestion Failed                           ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Show failure reasons if available
    FAILURE_REASONS=$(echo $JOB_STATUS | jq -r '.ingestionJob.failureReasons[]? // empty')
    if [ ! -z "$FAILURE_REASONS" ]; then
      echo -e "${YELLOW}Failure reasons:${NC}"
      echo "$FAILURE_REASONS"
      echo ""
    fi
    
    echo "Check CloudWatch logs for more details:"
    echo "  aws logs filter-log-events --log-group-name /aws/bedrock/knowledgebases/$KB_ID"
    echo ""
    
    exit 1
  fi
  
  sleep 2
done
