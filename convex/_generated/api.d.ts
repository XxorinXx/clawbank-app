/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_createWorkspace from "../actions/createWorkspace.js";
import type * as actions_fetchMembersOnchain from "../actions/fetchMembersOnchain.js";
import type * as actions_fetchTokenBalances from "../actions/fetchTokenBalances.js";
import type * as actions_fetchTokenMetadata from "../actions/fetchTokenMetadata.js";
import type * as actions_fetchTokenPrices from "../actions/fetchTokenPrices.js";
import type * as actions_getTokenMetadata from "../actions/getTokenMetadata.js";
import type * as actions_getTokenPrices from "../actions/getTokenPrices.js";
import type * as actions_getWorkspaceBalance from "../actions/getWorkspaceBalance.js";
import type * as actions_removeMember from "../actions/removeMember.js";
import type * as env from "../env.js";
import type * as internals_cacheHelpers from "../internals/cacheHelpers.js";
import type * as internals_workspaceHelpers from "../internals/workspaceHelpers.js";
import type * as queries_getWorkspaceMembers from "../queries/getWorkspaceMembers.js";
import type * as queries_listUserWorkspaces from "../queries/listUserWorkspaces.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/createWorkspace": typeof actions_createWorkspace;
  "actions/fetchMembersOnchain": typeof actions_fetchMembersOnchain;
  "actions/fetchTokenBalances": typeof actions_fetchTokenBalances;
  "actions/fetchTokenMetadata": typeof actions_fetchTokenMetadata;
  "actions/fetchTokenPrices": typeof actions_fetchTokenPrices;
  "actions/getTokenMetadata": typeof actions_getTokenMetadata;
  "actions/getTokenPrices": typeof actions_getTokenPrices;
  "actions/getWorkspaceBalance": typeof actions_getWorkspaceBalance;
  "actions/removeMember": typeof actions_removeMember;
  env: typeof env;
  "internals/cacheHelpers": typeof internals_cacheHelpers;
  "internals/workspaceHelpers": typeof internals_workspaceHelpers;
  "queries/getWorkspaceMembers": typeof queries_getWorkspaceMembers;
  "queries/listUserWorkspaces": typeof queries_listUserWorkspaces;
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
