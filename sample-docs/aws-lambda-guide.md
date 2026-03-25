# Example: AWS Lambda Overview

## What is AWS Lambda?

AWS Lambda is a serverless computing service that lets you run code without provisioning or managing servers. You pay only for the compute time you consume.

## Key Features

### 1. Event-Driven Execution
Lambda functions run in response to events from other AWS services:
- S3 bucket uploads
- DynamoDB stream updates
- API Gateway requests
- CloudWatch Events
- SNS notifications

### 2. Automatic Scaling
Lambda automatically scales your application by running code in response to each trigger. Your code runs in parallel and processes each trigger individually, scaling precisely with the size of the workload.

### 3. Subsecond Metering
With AWS Lambda, you are charged for every millisecond your code executes and the number of times your code is triggered. You don't pay anything when your code isn't running.

## Use Cases

### API Backend
Use Lambda with API Gateway to build RESTful APIs:
```python
def lambda_handler(event, context):
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }
```

### Data Processing
Process data in real-time from services like S3, DynamoDB, Kinesis:
- Image/video processing
- Log analysis
- ETL operations

### Automation
Automate AWS infrastructure tasks:
- Backup schedules
- Resource cleanup
- Security compliance checks

## Supported Runtimes

Lambda supports multiple programming languages:
- Python 3.8, 3.9, 3.10, 3.11, 3.12
- Node.js 16.x, 18.x, 20.x
- Java 8, 11, 17, 21
- .NET Core 3.1, 6, 7
- Go 1.x
- Ruby 2.7, 3.2
- Custom runtimes

## Pricing

Lambda pricing is based on:
1. **Number of requests**: First 1 million requests per month are free, then $0.20 per 1 million requests
2. **Duration**: $0.0000166667 per GB-second

### Example Cost Calculation
For a function with 512 MB memory running 100ms per invocation with 1 million requests/month:
- Compute charges: ~$0.83/month
- Request charges: Free (within free tier)
- **Total: ~$0.83/month**

## Best Practices

### 1. Optimize Memory Configuration
More memory = faster CPU and network performance. Monitor and adjust based on actual usage.

### 2. Use Environment Variables
Store configuration outside your code:
```python
import os
DB_HOST = os.environ['DB_HOST']
```

### 3. Minimize Cold Starts
- Keep deployment packages small
- Use provisioned concurrency for latency-sensitive applications
- Minimize dependencies

### 4. Implement Proper Error Handling
```python
def lambda_handler(event, context):
    try:
        # Your code here
        return {'statusCode': 200}
    except Exception as e:
        print(f"Error: {str(e)}")
        return {'statusCode': 500}
```

### 5. Monitor with CloudWatch
- Set up CloudWatch alarms for errors
- Use Lambda Insights for detailed metrics
- Enable X-Ray for distributed tracing

## Limitations

- **Execution timeout**: Maximum 15 minutes
- **Deployment package size**: 50 MB (zipped), 250 MB (unzipped)
- **Memory allocation**: 128 MB to 10,240 MB
- **Concurrent executions**: 1,000 per region (soft limit)
- **Temporary storage (/tmp)**: 512 MB to 10,240 MB

## Integration with Other AWS Services

Lambda integrates seamlessly with 200+ AWS services:

### Storage
- **S3**: Process file uploads
- **DynamoDB**: React to table changes
- **EFS**: Access shared file systems

### Messaging
- **SNS**: Publish/subscribe patterns
- **SQS**: Asynchronous message processing
- **EventBridge**: Event-driven architectures

### APIs
- **API Gateway**: Build REST and WebSocket APIs
- **AppSync**: GraphQL APIs
- **ALB**: Application Load Balancer integration

## Getting Started

1. Create a Lambda function in AWS Console
2. Choose a runtime (e.g., Python 3.11)
3. Write your function code
4. Configure triggers
5. Test and deploy

## Conclusion

AWS Lambda is a powerful serverless platform that enables you to build and run applications without managing servers. It's cost-effective, scales automatically, and integrates with the entire AWS ecosystem.
