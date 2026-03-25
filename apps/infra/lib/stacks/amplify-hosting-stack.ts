import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SSM_PARAM_PREFIX } from '../utils/constants';

export interface AmplifyHostingStackProps extends cdk.StackProps {
  /** GitHub repository URL */
  repository: string;
  /** GitHub branch name */
  branch?: string;
  /** GitHub access token (from Secrets Manager or SSM Parameter) */
  accessToken: cdk.SecretValue;
  /** User pool for authentication */
  userPool?: cognito.IUserPool;
  /** User pool client */
  userPoolClient?: cognito.IUserPoolClient;
  /** Identity pool ID */
  identityPoolId?: string;
  /** API Gateway URL */
  apiGatewayUrl?: string;
}

/**
 * AWS Amplify Hosting Stack
 *
 * This stack deploys the Next.js web application using AWS Amplify Hosting with:
 * - Automatic builds from GitHub repository
 * - CI/CD pipeline integration
 * - Environment variable injection
 * - Custom domain support (optional)
 * - Preview deployments for pull requests
 */
export class AmplifyHostingStack extends cdk.Stack {
  public readonly amplifyApp: amplify.CfnApp;
  public readonly branch: amplify.CfnBranch;

  constructor(scope: Construct, id: string, props: AmplifyHostingStackProps) {
    super(scope, id, props);

    const paramPrefix = SSM_PARAM_PREFIX;
    const branchName = props.branch || 'main';

    // Get infrastructure values from SSM parameters
    const userPoolId =
      props.userPool?.userPoolId ||
      ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Cognito/UserPoolId`);

    const userPoolClientId =
      props.userPoolClient?.userPoolClientId ||
      ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Cognito/UserPoolClientId`);

    const identityPoolId =
      props.identityPoolId ||
      ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Cognito/IdentityPoolId`);

    const apiGatewayUrl =
      props.apiGatewayUrl ||
      ssm.StringParameter.valueForStringParameter(this, `${paramPrefix}/Api/Url`);

    // Create IAM role for Amplify with scoped-down permissions
    const amplifyRole = new iam.Role(this, 'AmplifyRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Service role for AWS Amplify Hosting',
      inlinePolicies: {
        AmplifyHosting: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'amplify:*',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                `arn:aws:s3:::amplify-*`,
                `arn:aws:s3:::amplify-*/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'cloudfront:CreateInvalidation',
                'cloudfront:GetDistribution',
                'cloudfront:UpdateDistribution',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/amplify/*`],
            }),
          ],
        }),
      },
    });

    // Create Amplify App
    this.amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: 'knowledge-base-rag-agent',
      description: 'Knowledge Base RAG Agent Web Console',
      repository: props.repository,
      accessToken: props.accessToken.toString(),
      iamServiceRole: amplifyRole.roleArn,

      // Build settings
      buildSpec: cdk.Fn.sub(`version: 1
frontend:
  phases:
    preBuild:
      commands:
        - echo "Installing dependencies..."
        - npm install -g pnpm@9.15.4
        - pnpm install --frozen-lockfile
    build:
      commands:
        - echo "Building shared packages..."
        - pnpm --filter @agentic-app/types build
        - pnpm --filter @agentic-app/core build
        - echo "Building web application..."
        - cd apps/web
        - pnpm build
  artifacts:
    baseDirectory: apps/web/out
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - apps/web/node_modules/**/*
      - packages/*/node_modules/**/*
      - apps/web/.next/cache/**/*`),

      // Environment variables for the build
      environmentVariables: [
        {
          name: 'NEXT_PUBLIC_REGION',
          value: this.region,
        },
        {
          name: 'NEXT_PUBLIC_USER_POOL_ID',
          value: userPoolId,
        },
        {
          name: 'NEXT_PUBLIC_USER_POOL_CLIENT_ID',
          value: userPoolClientId,
        },
        {
          name: 'NEXT_PUBLIC_IDENTITY_POOL_ID',
          value: identityPoolId,
        },
        {
          name: 'NEXT_PUBLIC_API_URL',
          value: apiGatewayUrl,
        },
        {
          name: 'API_GATEWAY_URL',
          value: apiGatewayUrl,
        },
        {
          name: '_LIVE_UPDATES',
          value: '[{"pkg":"@aws-amplify/cli","type":"npm","version":"latest"}]',
        },
      ],

      // Platform configuration
      platform: 'WEB_COMPUTE',

      // Custom headers for security
      customHeaders: cdk.Fn.sub(`customHeaders:
  - pattern: '**/*'
    headers:
      - key: 'Strict-Transport-Security'
        value: 'max-age=31536000; includeSubDomains'
      - key: 'X-Frame-Options'
        value: 'SAMEORIGIN'
      - key: 'X-Content-Type-Options'
        value: 'nosniff'
      - key: 'X-XSS-Protection'
        value: '1; mode=block'
      - key: 'Referrer-Policy'
        value: 'strict-origin-when-cross-origin'`),

      // Custom rules for SPA routing
      customRules: [
        {
          source:
            '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],

      // Enable auto branch creation for pull requests
      enableBranchAutoDeletion: true,
    });

    // Create main branch
    this.branch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: this.amplifyApp.attrAppId,
      branchName: branchName,
      enableAutoBuild: true,
      enablePullRequestPreview: true,
      stage: 'PRODUCTION',
      framework: 'Next.js - SSG',
    });

    // Store Amplify App details in SSM
    new ssm.StringParameter(this, 'AmplifyAppIdParameter', {
      parameterName: `${paramPrefix}/Amplify/AppId`,
      stringValue: this.amplifyApp.attrAppId,
      description: 'AWS Amplify App ID',
    });

    new ssm.StringParameter(this, 'AmplifyDefaultDomainParameter', {
      parameterName: `${paramPrefix}/Amplify/DefaultDomain`,
      stringValue: this.amplifyApp.attrDefaultDomain,
      description: 'AWS Amplify Default Domain',
    });

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyApp.attrAppId,
      description: 'Amplify App ID',
      exportName: `${this.stackName}-AppId`,
    });

    new cdk.CfnOutput(this, 'AmplifyDefaultDomain', {
      value: this.amplifyApp.attrDefaultDomain,
      description: 'Amplify Default Domain',
      exportName: `${this.stackName}-DefaultDomain`,
    });

    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${branchName}.${this.amplifyApp.attrDefaultDomain}`,
      description: 'Amplify App URL',
      exportName: `${this.stackName}-AppUrl`,
    });

    new cdk.CfnOutput(this, 'AmplifyConsoleUrl', {
      value: `https://console.aws.amazon.com/amplify/home?region=${this.region}#/${this.amplifyApp.attrAppId}`,
      description: 'Amplify Console URL',
    });

    // Tag resources
    cdk.Tags.of(this).add('Project', 'AgentCore');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
