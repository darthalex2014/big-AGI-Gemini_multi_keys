import { z } from 'zod';
import { env } from '~/server/env.mjs';

import packageJson from '../../../../../package.json';

import { createTRPCRouter, publicProcedure } from '~/server/trpc/trpc.server';
import { fetchJsonOrTRPCThrow } from '~/server/trpc/trpc.router.fetchers';

import { GeminiWire_API_Models_List, GeminiWire_Safety } from '~/modules/aix/server/dispatch/wiretypes/gemini.wiretypes';

import { fixupHost } from '~/common/util/urlUtils';

import { ListModelsResponse_schema } from '../llm.server.types';
import { geminiFilterModels, geminiModelToModelDescription, geminiSortModels } from './gemini.models';

// Default hosts
const DEFAULT_GEMINI_HOST = 'https://generativelanguage.googleapis.com';

// Mappers

export function geminiAccess(access: GeminiAccessSchema, modelRefId: string | null, apiPath: string): { headers: HeadersInit, url: string, safetySettings: GeminiWire_Safety.SafetySetting[] } {
export function geminiAccess(access: GeminiAccessSchema, modelRefId: string | null, apiPath: string): { headers: HeadersInit, url: string } {

  const geminiKey = access.geminiKey || env.GEMINI_API_KEY || '';
  const geminiHost = fixupHost(access.geminiHost || DEFAULT_GEMINI_HOST, apiPath);

  // update model-dependent paths
  if (apiPath.includes('{model=models/*}')) {
    if (!modelRefId)
      throw new Error(`geminiAccess: modelRefId is required for ${apiPath}`);
    apiPath = apiPath.replace('{model=models/*}', modelRefId);
  }

  return {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-client': `big-agi/${packageJson['version'] || '1.0.0'}`,
      'x-goog-api-key': geminiKey,
    },
    url: geminiHost + apiPath,
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: access.minSafetyLevel,
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: access.minSafetyLevel,
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: access.minSafetyLevel,
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: access.minSafetyLevel,
      },
    ],
  };
  return {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-client': `big-agi/${packageJson['version'] || '1.0.0'}`,
      'x-goog-api-key': geminiKey,
    },
    url: geminiHost + apiPath,
  };
}

async function geminiGET<TOut extends object>(access: GeminiAccessSchema, modelRefId: string | null, apiPath: string): Promise<TOut> {
  const { headers, url, safetySettings } = geminiAccess(access, modelRefId, apiPath);
  return await fetchJsonOrTRPCThrow<TOut>({ url, headers, body: { safetySettings }, method: 'POST', name: 'Gemini' });
async function geminiGET<TOut extends object>(access: GeminiAccessSchema, modelRefId: string | null, apiPath: string /*, signal?: AbortSignal*/): Promise<TOut> {
  const { headers, url } = geminiAccess(access, modelRefId, apiPath);
  return await fetchJsonOrTRPCThrow<TOut>({ url, headers, name: 'Gemini' });
}

async function geminiPOST<TOut extends object, TPostBody extends object>(access: GeminiAccessSchema, modelRefId: string | null, body: TPostBody, apiPath: string): Promise<TOut> {
  const { headers, url, safetySettings } = geminiAccess(access, modelRefId, apiPath);
  return await fetchJsonOrTRPCThrow<TOut, TPostBody>({ url, method: 'POST', headers, body: { ...body, safetySettings }, name: 'Gemini' });
async function geminiPOST<TOut extends object, TPostBody extends object>(access: GeminiAccessSchema, modelRefId: string | null, body: TPostBody, apiPath: string /*, signal?: AbortSignal*/): Promise<TOut> {
  const { headers, url } = geminiAccess(access, modelRefId, apiPath);
  return await fetchJsonOrTRPCThrow<TOut, TPostBody>({ url, method: 'POST', headers, body, name: 'Gemini' });
}

// Input/Output Schemas

export const geminiAccessSchema = z.object({
  dialect: z.enum(['gemini']),
  geminiKey: z.string(),
  geminiHost: z.string(),
  minSafetyLevel: GeminiWire_Safety.HarmBlockThreshold_enum,
});
export type GeminiAccessSchema = z.infer<typeof geminiAccessSchema>;

const accessOnlySchema = z.object({
  access: geminiAccessSchema,
});

/**
 * See https://github.com/google/generative-ai-js/tree/main/packages/main/src for
 * the official Google implementation.
 */
export const llmGeminiRouter = createTRPCRouter({

  /* [Gemini] models.list = /v1beta/models */
  listModels: publicProcedure
    .input(accessOnlySchema)
    .output(ListModelsResponse_schema)
    .query(async ({ input }) => {

      // get the models
      const wireModels = await geminiGET(input.access, null, GeminiWire_API_Models_List.getPath);
      const detailedModels = GeminiWire_API_Models_List.Response_schema.parse(wireModels).models;

      // NOTE: no need to retrieve info for each of the models (e.g. /v1beta/model/gemini-pro).,
      //       as the List API already all the info on all the models

      // map to our output schema
      const models = detailedModels
        .filter(geminiFilterModels)
        .map(geminiModel => geminiModelToModelDescription(geminiModel))
        .filter(model => !!model)
        .sort(geminiSortModels);

      return {
        models: models,
      };
    }),

});
