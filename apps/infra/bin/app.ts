#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { AwsSolutionsChecks } from 'cdk-nag';

// Import all the modular stacks
import { SharedResourcesStack } from '../lib/stacks/shared-resources-stack';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { CognitoStack } from '../lib/stacks/cognito-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { AuroraPgVectorStack } from '../lib/stacks/aurora-pgvector-stack';
import { AgentCoreMemoryStack } from '../lib/stacks/agentcore-memory-stack';
import { AgentCoreRuntimeStack } from '../lib/stacks/agentcore-runtime-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { AmplifyHostingStack } from '../lib/stacks/amplify-hosting-stack';

// Import nag suppressions
import {
  applyNagSuppressions,
  suppressS3Warnings,
  suppressCognitoWarnings,
  suppressApiGatewayWarnings,
  suppressVpcWarnings,
  suppressSnsWarnings,
} from '../lib/utils/nag-suppressions';

// Load environment variables
dotenv.config();

const app = new cdk.App();

// Add cdk-nag security checks (only when CDK_NAG_ENABLED=true)
if (process.env.CDK_NAG_ENABLED === 'true') {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}

// Environment configuration
const region = process.env.AWS_REGION || 'us-east-1';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region };

// Application configuration from environment variables
const config = {
  // AgentCore settings
  agentCoreModelId: process.env.AGENTCORE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  
  // Lambda settings
  lambdaTimeoutSeconds: parseInt(process.env.LAMBDA_TIMEOUT_SECONDS || '300'),
  lambdaMemoryMB: parseInt(process.env.LAMBDA_MEMORY_MB || '1024'),
  
  // Network settings
  vpcCidr: process.env.VPC_CIDR || '10.0.0.0/18',
  vpcMaxAzs: parseInt(process.env.VPC_MAX_AZS || '2'),
  
  // Monitoring settings
  alertEmail: process.env.ALERT_EMAIL || 'admin@example.com',
  enableMonitoring: process.env.ENABLE_MONITORING === 'true',
  
  // Aurora pgvector settings
  auroraDatabaseName: process.env.AURORA_DATABASE_NAME || 'vectordb',
  auroraVectorTableName: process.env.AURORA_VECTOR_TABLE_NAME || 'bedrock_integration',
  
  // API settings
  corsEnabled: process.env.CORS_ENABLED === 'true',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],

  // Amplify Hosting settings
  githubRepository: process.env.GITHUB_REPOSITORY || '',
  githubTokenSecretName: process.env.GITHUB_TOKEN_SECRET_NAME || 'github-token',
};

// ============================================================================
// Stack Deployment Order:
// 1. Foundation Layer (no dependencies)
// 2. Core Infrastructure Layer
// 3. AgentCore Layer (Memory, then Runtime)
// 4. API Layer
// 5. Integration Layer (Monitoring, Web Console)
// ============================================================================

// 0. Shared Resources Layer - No dependencies (deployed first)
const sharedResourcesStack = new SharedResourcesStack(app, 'AgentCoreSharedResourcesStack', {
  env,
  description: 'Shared resources for AgentCore Template',
});

// 1. Foundation Layer - No dependencies
const networkStack = new NetworkStack(app, 'AgentCoreNetworkStack', {
  env,
  description: 'Network infrastructure for AgentCore Template',
  cidr: config.vpcCidr,
  maxAzs: config.vpcMaxAzs,
});

const storageStack = new StorageStack(app, 'AgentCoreStorageStack', {
  env,
  description: 'Storage infrastructure for AgentCore Template',
});

// 2. Core Infrastructure Layer
const cognitoStack = new CognitoStack(app, 'AgentCoreCognitoStack', {
  env,
  description: 'User authentication for AgentCore Template',
});

const databaseStack = new DatabaseStack(app, 'AgentCoreDatabaseStack', {
  env,
  description: 'Database infrastructure for AgentCore Template',
});

const auroraPgVectorStack = new AuroraPgVectorStack(app, 'AgentCoreAuroraPgVectorStack', {
  env,
  vpc: networkStack.vpc,
  bedrockRoleName: 'AgentCoreKnowledgeBaseRole',
  knowledgeBaseName: 'AgentCoreKnowledgeBaseV2',
  databaseName: config.auroraDatabaseName,
  vectorTableName: config.auroraVectorTableName,
  description: 'Aurora PostgreSQL with pgvector for AgentCore Template',
});

// 3. AgentCore Layer
const agentCoreMemoryStack = new AgentCoreMemoryStack(app, 'AgentCoreMemoryStack', {
  env,
  description: 'AgentCore Memory for conversation context and long-term recall',
});

const agentCoreRuntimeStack = new AgentCoreRuntimeStack(app, 'AgentCoreRuntimeStack', {
  env,
  modelId: config.agentCoreModelId,
  description: 'AgentCore Runtime for AI agent execution with IAM authentication',
});

// 4. API Layer
const apiStack = new ApiStack(app, 'AgentCoreApiStack', {
  env,
  vpc: networkStack.vpc,
  userPool: cognitoStack.userPool,
  corsEnabled: config.corsEnabled,
  corsOrigins: config.corsOrigins,
  description: 'API Gateway for AgentCore Template',
});

// 5. Integration Layer
const monitoringStack = new MonitoringStack(app, 'AgentCoreMonitoringStack', {
  env,
  alertEmail: config.alertEmail,
  description: 'Monitoring and alerting for AgentCore Template',
});

let amplifyHostingStack: AmplifyHostingStack | undefined;
if (process.env.DEPLOY_FRONTEND === 'true') {
  amplifyHostingStack = new AmplifyHostingStack(app, 'AgentCoreAmplifyHostingStack', {
    env,
    repository: config.githubRepository,
    accessToken: cdk.SecretValue.secretsManager(config.githubTokenSecretName),
    userPool: cognitoStack.userPool,
    userPoolClient: cognitoStack.userPoolClient,
    identityPoolId: cognitoStack.identityPool.ref,
    apiGatewayUrl: apiStack.api.url,
    description: 'Amplify Hosting for AgentCore Template',
  });
}

// ============================================================================
// Stack Dependencies
// ============================================================================

// Foundation layer dependencies
databaseStack.addDependency(networkStack);

// Aurora depends on network and shared resources
auroraPgVectorStack.addDependency(networkStack);
auroraPgVectorStack.addDependency(sharedResourcesStack);

// AgentCore Memory depends on storage (for KMS key)
agentCoreMemoryStack.addDependency(storageStack);

// AgentCore Runtime depends on:
// - Aurora pgvector (for RAG)
// - Memory (for conversation context)
// Note: Using IAM authentication, not Cognito
agentCoreRuntimeStack.addDependency(auroraPgVectorStack);
agentCoreRuntimeStack.addDependency(agentCoreMemoryStack);

// API layer dependencies
apiStack.addDependency(networkStack);
apiStack.addDependency(cognitoStack);
apiStack.addDependency(sharedResourcesStack);
apiStack.addDependency(agentCoreRuntimeStack);

// Integration layer dependencies
monitoringStack.addDependency(apiStack);
if (amplifyHostingStack) {
  amplifyHostingStack.addDependency(apiStack);
  amplifyHostingStack.addDependency(cognitoStack);
}

// ============================================================================
// Tags
// ============================================================================
cdk.Tags.of(app).add('Project', 'AgentCoreTemplate');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Architecture', 'AgentCore');

// ============================================================================
// CDK-NAG Suppressions (only when CDK_NAG_ENABLED=true)
// ============================================================================
if (process.env.CDK_NAG_ENABLED === 'true') {
  // Apply common suppressions to all stacks
  [
    sharedResourcesStack,
    networkStack,
    storageStack,
    cognitoStack,
    databaseStack,
    auroraPgVectorStack,
    agentCoreMemoryStack,
    agentCoreRuntimeStack,
    apiStack,
    monitoringStack,
    ...(amplifyHostingStack ? [amplifyHostingStack] : []),
  ].forEach((stack) => {
    applyNagSuppressions(stack);
  });

  // Apply specific suppressions
  suppressS3Warnings(storageStack);
  suppressCognitoWarnings(cognitoStack);
  suppressApiGatewayWarnings(apiStack);
  suppressVpcWarnings(networkStack);
  suppressSnsWarnings(monitoringStack);
}
