---
type: brief
title: ATU capstone kickoff, meeting 1
status: active
created: 2026-09-15
---

# ATU capstone kickoff brief

Noon, 2026-09-15. Webex (Becky's room). Students in COR 230: William Reyes (lead contact), Preston Diehl, Brady Snow, Alex Pham. Faculty: Becky Cunningham, Dr. Robin Ghosh. Jim Bob Humphrey's Senior Resource Navigator is folded into this project.

Read this top to bottom in ten minutes. Sections 1 to 3 are what you say. Section 4 is the honest state of the code. Section 5 is what you hand them. Section 6 is the questions they will ask and what to say. Section 7 is the "how companies actually use AI" talk. Section 8 is the agenda.

---

## 1. What Town Square is (60 seconds)

Town Square is a community-wide app for one town. Three layers:

1. **Aggregation.** News, events, notices, pulled into one place.
2. **Discovery.** A directory of everything the town produces: businesses, articles, podcasts, services. Built for finding the thing you did not know to look for.
3. **The build layer.** Anyone in the community can build a small app on top of Town Square and plug it in, so the rest of the town can find and use it.

Open source. Russellville is town one. Any town can fork it.

One-liner: *every community app so far is a product the town consumes. This is infrastructure the town builds on.*

## 2. Why we are building it

- Every leader in the Aug 6 ATU workshop room said the same thing before Town Square came up: "nobody can find us," "we struggle to communicate with the community."
- Nonprofits pay per email and per boosted post to reach people who already asked to hear from them. The smallest budgets doing the most urgent work get squeezed out first.
- The town's attention got handed to platforms that own it and sell it back. Nobody should own a town square.
- ATU's own needs-finding workshop named the same five gaps: access to information, communication about services, transportation coordination, resource mapping, data collection.
- Value compounds with the number of people **building**, not reading. One resident's dataset becomes the next builder's input.

## 3. How the students work on it

**They build creations, not core.** A creation is a sandboxed mini-app that runs inside Town Square. This is deliberate and it is the whole strategy:

- ATU's partner guide says students and faculty own nothing after April and the partner owns hosting forever. Creations run on infrastructure that already exists and is already maintained, so nothing is orphaned in April.
- Creations are isolated. A stalled team cannot slow core down. A creation that breaks only breaks itself.
- The review queue is the accountability gate. Their exact version either passes review or it does not.
- It is also the realistic job. Most of them will spend their careers building on someone else's platform against someone else's contract.

**Their first creation is the Senior Resource Navigator** (Jim Bob's proposal). Searchable, categorized directory and map of local senior services. Plain-language assistant ("where can I get a ride to dialysis?"). Simple admin tool to keep listings current. Search analytics. Humphrey Funeral Service supplies the data. Stretch: voice, English/Spanish, SMS.

Why it is a good first creation: it exercises every part of the contract (read town data, define a new record type, write back, identity, review) and it has a real sponsor with real data and a real user population.

Second creation, if they have the appetite: the Community Services and Volunteer Board (coalition/proposals/02). The senior navigator is a special case of it.

**The work is in two halves, and half one is theirs to lead.** Fall = understand the contract, build the navigator against the local dev stack, ship it through review. Spring = harden, add the assistant and the admin tool, present in April.

## 4. Honest state of the code (do not oversell)

What exists, in a private GitHub repo (`tswic-highdesert/townsquare`, pnpm + Node 22 + TypeScript, no build step):

- **The platform core runs locally.** 913 passing tests. Four processes: read API, sandbox bundle server, the web shell, and the MCP builder server.
- **The creation contract is written and enforced.** `townsquare.json` manifest with a default-deny permissions block, an SDK (`@townsquare/sdk`) with five namespaces (`town`, `user`, `records`, `storage`, `app`), sandboxed iframe with a postMessage bridge, CSP compiled from the manifest.
- **The review queue works.** Approval is of one exact version, updates are reviewed too, reviewer sees a permission diff.
- **The MCP builder door works.** 17 tools (`get_sdk_docs`, `scaffold`, `query_town_data`, `validate`, `preview`, `submit`, and so on) so a builder can connect their own AI tool and build a creation end to end.
- **One example creation** (`burrito-index`) in `apps/sandbox/examples/`.
- **Real Russellville data.** The 741-listing business directory and the news/event ingest from v1 are wired into the Today screen.
- **Identity by vouching** is specified and partly built.

What does NOT exist yet:

- **It is not deployed.** `rvtownsquare.com` is still the old marketing site on Vercel. The platform has only ever run on Tal's laptop. Deploying it (Railway, two domains: `rvtownsquare.com` shell + `gettownsquare.com` for untrusted bundles) is the next infrastructure step and is Tal's job, not theirs.
- **Write-back (`records.*`) is designed but deferred.** It is the highest-risk piece. The navigator will need it, so it is on the critical path this fall.
- **No CLI, no starter template, no forking yet.** The MCP door is the only authoring path today. A plain "clone this folder" starter template is cheap and would let a no-AI student start.
- **No open-source license chosen yet.** Repo is private. Needs a decision before students commit.
- **Resident reporting is a stub.** Moderation is a role Tal holds.

Say it this way: "The foundation is built and tested. It is not on the internet yet. You will be the first builders on it, which means you will find the sharp edges, and finding them is part of the job."

## 5. What to hand them

Give them access to the repo and point at these, in order:

1. `README.md` (the one-paragraph idea, the repo map, the two security rules).
2. `VISION.md` (what it is, every decision so far).
3. `packages/sdk/generated/AGENTS.md` (306 lines, **the builder doc**: four rules, error codes, limits, full SDK reference). This is written for an AI agent to read, which means it is also the clearest doc for a human.
4. `spec-manifest-and-sdk.md` (the contract in depth).
5. `DEVELOPING.md` (run it locally: `pnpm install`, `pnpm dev:api`, `pnpm dev:sandbox`, `pnpm dev:web`, open `http://townsquare.localhost:5173`).
6. `apps/sandbox/examples/burrito-index/` (the one working example creation; read it before writing one).
7. `creation-authoring.md` (the MCP route and the review flow).
8. Jim Bob's proposal PDF (attached to Becky's Sep 4 email).

Do not hand them core packages to modify. Their surface is the SDK.

**Two authoring doors, their choice per person:**
- **With AI:** connect the Town Square MCP server to Claude Code, Cursor, or whatever they use. `pnpm dev:mcp` prints the paste-ready connect line. The agent reads the SDK docs through the same door.
- **Without AI:** copy `burrito-index`, read `AGENTS.md`, write HTML and JS against the SDK, run `validate` and `preview`. There is no build step, so this is very approachable.

Both doors produce the same folder and go through the same review.

## 6. Questions they will ask, and what to say

**"What stack is it?"** TypeScript end to end. pnpm workspaces, Node 22, Fastify API, Postgres, React for the shell, Vite. Creations are plain static HTML/JS/CSS with no framework requirement. They can use any framework as long as the output is vendored static files.

**"Can we use React / a framework in our creation?"** Yes, if it is bundled into the folder. No CDN scripts, no npm at runtime. `script-src 'self'` is enforced, so a remote script will not run even if review misses it.

**"Where does the data come from for the navigator?"** Two places. Town data (businesses, events, notices) is already ingested and readable through `town.*` with no permission needed. Senior services are a **new record type** they define in the manifest (`defines`), seed from Jim Bob's list, and write back through `records.*`. Once defined, any future creation can read it.

**"Can we hit an outside API, like a maps service or an LLM?"** Only hosts declared in `permissions.network`, reviewed by an admin, compiled into the CSP. Map tiles: yes, declare the host. Calling an LLM directly from the browser: no, because that would expose a key. The assistant needs a server-side piece. That is a real design question to work through together (see below).

**"How do we build the AI assistant if creations are static?"** This is the best open question and the honest answer is "we design it together." Options: a small platform-side endpoint the creation calls through the SDK, a Town Square-hosted assistant service creations can declare a permission for, or retrieval-only (structured search over the record type, no generation) for v1. Recommend retrieval-only first, generation second.

**"How do users log in? Can we see who they are?"** Magic link / session on the shell. A creation only ever learns `{ handle, verified }`. No email, no real name, no user id. Most visitors are signed out, and the app must work for them. Verified means vouched-for resident.

**"Who reviews our submissions and how fast?"** Tal, at launch. Approval is of one exact version. Updates are reviewed too. Turnaround: same or next day during the semester. Trusted-builder auto-approve is planned but not built.

**"What about testing?"** Vitest for unit, Playwright for e2e in the platform. For a creation, the MCP `test` and `validate` tools run the autochecks. They should write their own tests for their logic.

**"How do we deploy?"** They do not. They submit. The platform hosts. Tal owns deploying the platform itself.

**"Git workflow?"** Their creation lives in its own repo (they own it, public on GitHub is fine). Platform repo access is read-only for now. If they find a platform bug, file an issue with a repro; fixes to core are discussed first.

**"What is the license?"** Open source, license not chosen yet. Decide in the next two weeks. Default recommendation: AGPL for the platform (forks must stay open), MIT for the SDK and templates (so creations are unencumbered). Their creation's license is theirs.

**"What happens in April?"** The creation stays live on Town Square. They can keep contributing or not. Nothing they built gets orphaned because it runs on infrastructure Tal maintains.

**"Is this real / who uses it?"** Not deployed yet. Real data, real sponsor, real town, launch this school year. They are building the first thing on it.

Questions you may not be able to answer on the spot, and that is fine to say:
- Exact Postgres schema details, CSP compile rules, bridge protocol internals. Answer: "it is in the spec and the code, read it and bring your questions to meeting two."
- Scaling, multi-town deployment shape (one instance vs per-town). Answer: "undecided, Russellville first."

## 7. How companies actually use AI (the part they will not get in class)

You are the realistic preview of the teams they will join. Say so.

- **The people writing the spec are increasingly not engineers.** Tal has no CS degree and built the platform with AI agents doing the typing against specs he wrote. 913 tests. That is the norm they are walking into, not the exception.
- **The scarce skill moved.** Knowing what to build, writing a contract tight enough that an agent cannot misread it, reviewing what came back, and owning the security boundary. Typing was the cheap part.
- **AI-authored is the expected default, not a shortcut.** The SDK was designed to be "LLM-authorable": small, stable, typed, example-rich, hard to misuse. That is a real design constraint now. Docs are written for agents first because agents read them most.
- **Review is the job.** In an agentic shop, the human is the reviewer and the owner of the boundary. The Town Square permission block exists so a human can approve an app without reading its code. That is how a lot of software is going to get shipped.
- **Their advantage over Tal:** they know why things work. When the agent produces something wrong, a CS graduate can tell. That is the pairing companies want: people who can specify plus people who can verify.
- **What Tal expects of them:** use AI if you want, do not use it if you want, but own what you ship either way. Explain every line you submit.
- **The future of Tal's businesses is agentically driven.** Norristown portfolio dashboards, StateGov, Free Arkansas. Town Square is the same bet applied to a town.

## 8. Agenda for the hour

1. Intros. Who they are, what each wants out of the year. (10 min)
2. Town Square in 60 seconds, then why. (10 min)
3. How they plug in: creations, the SDK, the review gate, why not core. (10 min)
4. The senior navigator as creation one, Jim Bob's role. (10 min)
5. Their technical questions. Write down every one you cannot answer. (15 min)
6. Logistics. (5 min)
   - Repo access: their GitHub handles.
   - Discord: Tal joins their server. Ask for invite.
   - Cadence: weekly? Tuesday 6pm is theirs; propose a recorded weekly with async Discord in between.
   - Homework for them: run it locally, read `AGENTS.md`, open `burrito-index`, come back with questions and a first-pass data model for senior services.
   - Homework for Tal: license decision, deploy plan, a starter template, answer the written-down questions.
   - Meeting with Jim Bob: schedule in the next two weeks.

## 9. Asks to collect before you hang up

- Four GitHub usernames.
- Discord invite.
- Their preferred tools (VS Code? any AI tools already?).
- Whether Dr. Ghosh or Becky wants written milestones, and in what format.
- Confirm the April showcase date.
