/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_agentAuth from "../actions/agentAuth.js";
import type * as actions_agentRefresh from "../actions/agentRefresh.js";
import type * as actions_agentTransfer from "../actions/agentTransfer.js";
import type * as actions_buildAgentActivationTx from "../actions/buildAgentActivationTx.js";
import type * as actions_buildAgentRevocationTx from "../actions/buildAgentRevocationTx.js";
import type * as actions_createWorkspace from "../actions/createWorkspace.js";
import type * as actions_fetchMembersOnchain from "../actions/fetchMembersOnchain.js";
import type * as actions_fetchTokenBalances from "../actions/fetchTokenBalances.js";
import type * as actions_fetchTokenMetadata from "../actions/fetchTokenMetadata.js";
import type * as actions_fetchTokenPrices from "../actions/fetchTokenPrices.js";
import type * as actions_generateConnectCode from "../actions/generateConnectCode.js";
import type * as actions_getTokenMetadata from "../actions/getTokenMetadata.js";
import type * as actions_getTokenPrices from "../actions/getTokenPrices.js";
import type * as actions_getWorkspaceBalance from "../actions/getWorkspaceBalance.js";
import type * as actions_httpAuth from "../actions/httpAuth.js";
import type * as actions_provisionAgent from "../actions/provisionAgent.js";
import type * as actions_removeMember from "../actions/removeMember.js";
import type * as actions_transferApproval from "../actions/transferApproval.js";
import type * as actions_updateSpendingLimitOnchain from "../actions/updateSpendingLimitOnchain.js";
import type * as crons from "../crons.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as internals_agentHelpers from "../internals/agentHelpers.js";
import type * as internals_cacheHelpers from "../internals/cacheHelpers.js";
import type * as internals_dpopHelpers from "../internals/dpopHelpers.js";
import type * as internals_rateLimitCheck from "../internals/rateLimitCheck.js";
import type * as internals_transferHelpers from "../internals/transferHelpers.js";
import type * as internals_workspaceHelpers from "../internals/workspaceHelpers.js";
import type * as lib_authMiddleware from "../lib/authMiddleware.js";
import type * as lib_connectCode from "../lib/connectCode.js";
import type * as lib_dpop from "../lib/dpop.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_spendingLimitPolicy from "../lib/spendingLimitPolicy.js";
import type * as lib_turnkeyHelpers from "../lib/turnkeyHelpers.js";
import type * as lib_txBuilders from "../lib/txBuilders.js";
import type * as mutations_agents from "../mutations/agents.js";
import type * as queries_agents from "../queries/agents.js";
import type * as queries_getWorkspaceMembers from "../queries/getWorkspaceMembers.js";
import type * as queries_listUserWorkspaces from "../queries/listUserWorkspaces.js";
import type * as queries_transferRequests from "../queries/transferRequests.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/agentAuth": typeof actions_agentAuth;
  "actions/agentRefresh": typeof actions_agentRefresh;
  "actions/agentTransfer": typeof actions_agentTransfer;
  "actions/buildAgentActivationTx": typeof actions_buildAgentActivationTx;
  "actions/buildAgentRevocationTx": typeof actions_buildAgentRevocationTx;
  "actions/createWorkspace": typeof actions_createWorkspace;
  "actions/fetchMembersOnchain": typeof actions_fetchMembersOnchain;
  "actions/fetchTokenBalances": typeof actions_fetchTokenBalances;
  "actions/fetchTokenMetadata": typeof actions_fetchTokenMetadata;
  "actions/fetchTokenPrices": typeof actions_fetchTokenPrices;
  "actions/generateConnectCode": typeof actions_generateConnectCode;
  "actions/getTokenMetadata": typeof actions_getTokenMetadata;
  "actions/getTokenPrices": typeof actions_getTokenPrices;
  "actions/getWorkspaceBalance": typeof actions_getWorkspaceBalance;
  "actions/httpAuth": typeof actions_httpAuth;
  "actions/provisionAgent": typeof actions_provisionAgent;
  "actions/removeMember": typeof actions_removeMember;
  "actions/transferApproval": typeof actions_transferApproval;
  "actions/updateSpendingLimitOnchain": typeof actions_updateSpendingLimitOnchain;
  crons: typeof crons;
  env: typeof env;
  http: typeof http;
  "internals/agentHelpers": typeof internals_agentHelpers;
  "internals/cacheHelpers": typeof internals_cacheHelpers;
  "internals/dpopHelpers": typeof internals_dpopHelpers;
  "internals/rateLimitCheck": typeof internals_rateLimitCheck;
  "internals/transferHelpers": typeof internals_transferHelpers;
  "internals/workspaceHelpers": typeof internals_workspaceHelpers;
  "lib/authMiddleware": typeof lib_authMiddleware;
  "lib/connectCode": typeof lib_connectCode;
  "lib/dpop": typeof lib_dpop;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/spendingLimitPolicy": typeof lib_spendingLimitPolicy;
  "lib/turnkeyHelpers": typeof lib_turnkeyHelpers;
  "lib/txBuilders": typeof lib_txBuilders;
  "mutations/agents": typeof mutations_agents;
  "queries/agents": typeof queries_agents;
  "queries/getWorkspaceMembers": typeof queries_getWorkspaceMembers;
  "queries/listUserWorkspaces": typeof queries_listUserWorkspaces;
  "queries/transferRequests": typeof queries_transferRequests;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
