# Decisions

Why spwn is built the way it is. One record per decision, chronological, the
title naming the thing it decides about. A chapter states what holds today; a
record here states what was chosen, when, and what it cost.

Numbers are historical and never reused. ADR-003 (security as physics) is
absent on purpose: it is a decision about the product itself rather than about
this codebase, and it lives in the spwn product knowledge corpus outside this
repository.

| Record                                                    | Decides                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| [001](001-gate-over-socket.md)                            | A gate abstraction between the SDK and the container transport   |
| [002](002-defer-instincts-layer.md)                       | Instincts deferred to v2; auto-discovered patterns are playbooks |
| [004](004-claude-code-as-runtime.md)                      | Claude Code CLI as the agent runtime spawned inside worlds       |
| [005](005-go-core.md)                                     | Go for the domain packages and the CLI                           |
| [006](006-acp-inside-container.md)                        | ACP as the protocol between the container-side gate and the CLI  |
| [007](007-rust-container-gate.md)                         | Rust for the container-side gate binary                          |
| [008](008-rivet-runtime-layer.md)                         | Rivet as the runtime normalization layer inside worlds           |
| [009](009-zeroclaw-as-claw.md)                            | ZeroClaw as the Architect daemon                                 |
| [010](010-pi-mono-multi-provider.md)                      | Pi-mono as the primary multi-provider runtime                    |
| [011](011-ports-and-adapters.md)                          | Every external system behind a port with swappable adapters      |
| [012](012-organization-manifest.md)                       | `org.yaml` as the top-level manifest with cascading overrides    |
| [013](013-dood-over-dind.md)                              | Docker-outside-of-Docker over Docker-in-Docker                   |
| [014](014-filesystem-messenger.md)                        | Filesystem inboxes for agent-to-agent messaging                  |
| [015](015-lint-enforced-layering.md)                      | Layered imports enforced by depguard, not by convention          |

Records 008, 009, 010 and 012 describe designed work that is not shipped; the
chapter that owns each subject says where the code stands today.

A new record starts from [`_template.md`](_template.md). An agent leaves the
status `Proposed`; only the owner writes `Accepted`.
