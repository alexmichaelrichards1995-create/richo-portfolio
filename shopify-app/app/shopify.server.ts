import { shopifyApp } from '@shopify/shopify-app-react-router/server';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SCOPES?.split(',').map((scope) => scope.trim()).filter(Boolean)!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  useOnlineTokens: true,
});

export default shopify;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
