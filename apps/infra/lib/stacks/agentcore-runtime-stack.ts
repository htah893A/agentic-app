import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { SSM_PARAM_PREFIX } from '../utils/constants';

export interface AgentCoreRuntimeStackProps extends cdk.StackProps {
  modelId?: string;
}

export class AgentCoreRuntimeStack extends cdk.Stack {
  public readonly runtime: agentcore.Runtime;
  public readonly runtimeIdParameter: ssm.StringParameter;
  public readonly audioBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeStackProps) {
    super(scope, id, props);

    const paramPrefix = SSM_PARAM_PREFIX;
    const modelId = props.modelId || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

    // SSM parameter lookups
    const clusterEndpoint = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Aurora/ClusterEndpoint`);
    const databaseName = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Aurora/DatabaseName`);
    const vectorTableName = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Aurora/VectorTableName`);
    const secretArn = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Aurora/SecretArn`);
    const memoryId = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/AgentCore/MemoryId`);
    const knowledgeBaseId = ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/KnowledgeBaseId`);

    // S3 bucket for voice audio uploads (Transcribe input)
    this.audioBucket = new s3.Bucket(this, 'AudioBucket', {
      bucketName: `agentcore-lang-audio-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        { expiration: cdk.Duration.days(1), prefix: 'audio-uploads/' },
      ],
    });

    // Table names
    const progressTable = 'AgentCoreTemplate-LearnerProgress';
    const reviewTable = 'AgentCoreTemplate-LearnerReviews';

    // Build agent container
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      path.join(__dirname, '../../agent'),
      { platform: Platform.LINUX_ARM64 },
    );

    // Create the AgentCore Runtime
    this.runtime = new agentcore.Runtime(this, 'AgentRuntime', {
      runtimeName: 'language_learning_agent',
      description: 'Language Learning Multi-Agent System - Personal AI Teacher',
      agentRuntimeArtifact,
      environmentVariables: {
        MODEL_ID: modelId,
        AGENT_TYPE: 'orchestrator',
        AURORA_CLUSTER_ENDPOINT: clusterEndpoint,
        AURORA_DATABASE_NAME: databaseName,
        AURORA_VECTOR_TABLE_NAME: vectorTableName,
        AURORA_SECRET_ARN: secretArn,
        KNOWLEDGE_BASE_ID: knowledgeBaseId,
        MEMORY_ID: memoryId,
        PROGRESS_TABLE: progressTable,
        REVIEW_TABLE: reviewTable,
        AUDIO_BUCKET: this.audioBucket.bucketName,
        AWS_REGION: this.region,
      },
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: cdk.Duration.minutes(15),
        maxLifetime: cdk.Duration.hours(8),
      },
    });

    // --- IAM Permissions ---

    // Bedrock model invocation (cross-region inference)
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        'arn:aws:bedrock:*::foundation-model/*',
        `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
      ],
    }));

    // Aurora RDS Data API
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction',
      ],
      resources: [`arn:aws:rds:${this.region}:${this.account}:cluster:*`],
    }));

    // Secrets Manager (Aurora credentials)
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      resources: [secretArn],
    }));

    // Bedrock Knowledge Base
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`],
    }));

    // AgentCore Memory
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:CreateEvent', 'bedrock-agentcore:GetEvent',
        'bedrock-agentcore:DeleteEvent', 'bedrock-agentcore:ListEvents',
      ],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:memory/*`],
    }));

    // DynamoDB - Learner Progress + Reviews
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${progressTable}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${progressTable}/index/*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${reviewTable}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${reviewTable}/index/*`,
      ],
    }));

    // Amazon Polly (Text-to-Speech)
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['polly:SynthesizeSpeech', 'polly:DescribeVoices'],
      resources: ['*'],
    }));

    // Amazon Transcribe (Speech-to-Text)
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'transcribe:StartTranscriptionJob', 'transcribe:GetTranscriptionJob',
        'transcribe:DeleteTranscriptionJob',
      ],
      resources: ['*'],
    }));

    // S3 audio bucket access (for Transcribe input/output)
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [this.audioBucket.arnForObjects('*')],
    }));
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [this.audioBucket.bucketArn],
    }));

    // KMS for Memory encryption
    this.runtime.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'kms:ViaService': `bedrock-agentcore.${this.region}.amazonaws.com` },
      },
    }));

    // --- Endpoint ---
    this.runtime.addEndpoint('default', {
      version: '1',
      description: 'Default endpoint for Language Learning Agent',
    });

    // --- SSM Parameters ---
    this.runtimeIdParameter = new ssm.StringParameter(this, 'RuntimeIdParameter', {
      parameterName: `${paramPrefix}/AgentCore/RuntimeId`,
      stringValue: this.runtime.agentRuntimeId,
    });

    new ssm.StringParameter(this, 'RuntimeArnParameter', {
      parameterName: `${paramPrefix}/AgentCore/RuntimeArn`,
      stringValue: this.runtime.agentRuntimeArn,
    });

    new ssm.StringParameter(this, 'RuntimeEndpointParameter', {
      parameterName: `${paramPrefix}/AgentCore/RuntimeEndpoint`,
      stringValue: 'default',
    });

    new ssm.StringParameter(this, 'ModelIdParameter', {
      parameterName: `${paramPrefix}/ModelId`,
      stringValue: modelId,
    });

    new ssm.StringParameter(this, 'AudioBucketParameter', {
      parameterName: `${paramPrefix}/AudioBucketName`,
      stringValue: this.audioBucket.bucketName,
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'RuntimeId', {
      value: this.runtime.agentRuntimeId,
      exportName: `${this.stackName}-RuntimeId`,
    });

    new cdk.CfnOutput(this, 'RuntimeArn', {
      value: this.runtime.agentRuntimeArn,
      exportName: `${this.stackName}-RuntimeArn`,
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: this.audioBucket.bucketName,
      exportName: `${this.stackName}-AudioBucketName`,
    });
  }
}
