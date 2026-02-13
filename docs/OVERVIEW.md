ClawBank — Product Overview & Full Flow (v1)

1. Vision

ClawBank enables AI agents to safely control real on-chain money on Solana.

Humans create a shared vault (Squads multisig), invite humans and agents, and assign:

Roles (who can approve)

Budgets (how much each agent can spend autonomously)

Agents can then:

Spend within budget without human approval

Request approval when exceeding limits

Operate continuously (e.g., trading, payments, automation)

This creates the first practical agent banking layer for crypto-native companies.

2. Core Principles

Humans keep ultimate control (multisig governance)

Agents have bounded autonomy (spending limits)

No raw private keys in our system

Enterprise-grade auditability

Simple UX first, power later

3. Architecture Overview
   On-chain layer

Squads v4 multisig + vault

Per-agent spending limits

Human approval for config / over-limit actions

Custody & signing

Human wallets: Privy embedded Solana wallets

Agent wallets: Turnkey secure signing (API-gated autonomy)

Infrastructure

RPC: Helius

Backend & DB: Convex

Token data & swaps: Jupiter API

Frontend

React + Vite + TypeScript

Privy authentication modal

Minimal, clean UX

4. Tech Stack
   Frontend

React

Vite

TypeScript

Privy (auth + embedded Solana wallet)

Backend

Convex (functions + database)

Turnkey (agent wallet custody + signing)

Helius RPC

Jupiter API (token metadata, pricing, swaps)

On-chain

Solana

Squads multisig + spending limits

5. User Experience Flow
   5.1 Landing Page

Super simple UI:

Logo

1–2 line product description

Primary CTA button

CTA behavior

Opens Privy modal:

Login with Google or email

Must retrieve email address

Privy creates embedded Solana wallet

Result:
➡ User authenticated
➡ Wallet created
➡ User enters app

5.2 Workspaces Screen (Empty State)

If user has no workspaces:

Centered container with:

Header

Sub-header

Primary button: “Create Workspace”

Secondary text button: “Continue with Squads”

5.3 Create Workspace Flow
Primary path — Create new workspace

Opens onboarding modal:

User chooses:

Workspace name

Invite members

By email

By Solana wallet

Result:

Squads multisig created

Vault initialized

Workspace saved in Convex

User redirected to workspace

Secondary path — Continue with existing Squads

Opens wallet connect modal:

User connects an existing Solana wallet

We search Squads multisigs where this pubkey is a member

Found workspaces are imported into app

Then:

Wallet is permanently linked to user account in DB

Cached for fast future loading

5.4 Workspace Page Layout
Header row

Workspace name

Settings button

Balance section

Total balance in USD

Primary actions

Buttons:

Deposit

Send

Connect Agent

Swap (only if >1 asset)

5.5 Workspace Tabs
1️⃣ Requests (default tab)

Shows:

AI-initiated requests

Spending attempts

Budget increase proposals

Human approval actions

This is the core operating surface.

2️⃣ Activity

Contains:

Only app-level events

No raw on-chain indexing

Examples:

Agent connected

Limit changed

Proposal approved

3️⃣ Agents

List of:

Connected agents

Budget per agent

Status

Last activity

Backed by:

Turnkey wallets

Squads member roles

Spending limits

4️⃣ Humans

Shows:

Human members

Roles (voter, executor, almighty)

Invitation status

5️⃣ Balances

Displays:

Token balances

USD values via Jupiter pricing

Swap availability

6. Agent Model (v1)

Each agent:

Has a Turnkey Solana wallet

Is added as a Squads member

Receives spending limits

Spending behavior

Under limit:

Agent calls backend

Backend signs via Turnkey

Tx executes immediately

Over limit or config change:

Proposal created

Humans approve via Squads flow

7. Security Model
   Human safety

Multisig governance

Humans approve sensitive actions

No controlled multisig

Agent safety

Policy-gated signing via backend

Per-agent budgets

Rate-limit only for DDOS protection (not trading limits)

Key custody

Humans → Privy embedded wallets

Agents → Turnkey secure custody

No raw private keys stored by us

8. Scope of v1
   Included

Auth via Privy

Workspace creation/import

Squads multisig + vault

Agent connection via Turnkey

Spending limits

Basic balances + swaps

Requests approval flow

Deferred / backlog

Destination allowlists

Advanced policies

Deep on-chain indexing

Complex accounting exports

Multi-chain support

9. Mental Model

ClawBank = Bank account for humans + AI agents

Squads = vault + governance

Turnkey = secure agent signer

Privy = human identity + wallet

Convex = coordination brain

Result:

➡ Agents can safely use money
➡ Humans remain in control
➡ UX stays simple
