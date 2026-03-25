import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ApiProxyConstructProps {
  /**
   * The API endpoint to proxy requests to
   */
  apiEndpoint: string;

  /**
   * The allowed origins for CORS
   */
  allowedOrigins: string[];

  /**
   * The name of the API Gateway
   */
  apiName?: string;
}

/**
 * A construct that creates a serverless proxy for API requests
 */
export class ApiProxyConstruct extends Construct {
  /**
   * The API Gateway instance
   */
  public readonly api: apigateway.RestApi;

  /**
   * The Lambda function that handles the proxy requests
   */
  public readonly proxyFunction: lambda.Function;

  /**
   * The URL of the API Gateway
   */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiProxyConstructProps) {
    super(scope, id);

    // Create the Lambda function for the proxy
    this.proxyFunction = new lambda.Function(this, 'ProxyFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../../packages/lambdas/api-proxy')),
      environment: {
        TARGET_API_ENDPOINT: props.apiEndpoint,
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
        NODE_ENV: 'production',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Create a policy to allow the Lambda function to make Logs API calls for logging
    const policy = new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    });

    this.proxyFunction.addToRolePolicy(policy);

    // Create a role for API Gateway CloudWatch logging
    const apiGatewayLoggingRole = new iam.Role(this, 'ApiGatewayLoggingRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ),
      ],
    });

    // Create the API Gateway
    this.api = new apigateway.RestApi(this, 'ProxyApi', {
      restApiName: props.apiName || 'API Proxy',
      description: 'Proxy API for Bedrock Agent Assistant',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Headers',
          'Access-Control-Allow-Methods',
          'Origin',
          'Accept',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.seconds(600),
      },
      deployOptions: {
        stageName: 'prod',
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(
          new logs.LogGroup(this, 'ApiAccessLogs', {
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          })
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    // Create a request validator
    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const methodOptions: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.IAM,
      requestValidator,
    };

    // Add a proxy resource to the API Gateway
    const proxyResource = this.api.root.addResource('{proxy+}');

    // Add a method to the proxy resource
    proxyResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(this.proxyFunction),
      methodOptions
    );

    // Add a method to the root resource
    this.api.root.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(this.proxyFunction),
      methodOptions
    );

    // Set the API URL
    this.apiUrl = `${this.api.url}`;

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiProxyUrl', {
      value: this.apiUrl,
      description: 'The URL of the API Proxy',
    });
  }
}
