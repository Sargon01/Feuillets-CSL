# Feuillets / Feuillets CSL compatibility

The citation provider API remains **v2**. All four combinations below register
successfully, but registration does not prove that the host accepts a provider's
recoverable diagnostics.

The published versions tested are Feuillets **3.5.2** (`5d6ca501`) and Feuillets CSL
**0.1.3** (`41cdd991`). Corrected builds are identified by source commits, not by
their unchanged manifest versions: Feuillets `6ed59b6` and companion `1d656f3`.

| Feuillets | Companion | Valid library / unknown citation | Unsupported or duplicate entry | Cited cyclic crossref |
|---|---|---|---|---|
| Published 3.5.2 | Published 0.1.3 | Valid groups render; unknown groups stay raw | Global failure, even if the entry is unused | Unsafe cyclic inheritance is accepted: inherited limitation |
| Corrected `6ed59b6` | Published 0.1.3 | Same behavior | Same inherited global failure | Same inherited unsafe cycle handling |
| Published 3.5.2 | Corrected `1d656f3` | Valid groups render; unknown groups stay raw | Unused entry is isolated; citing it makes the old host reject the complete result | Provider isolates it, but old host rejects the complete result |
| Corrected `6ed59b6` | Corrected `1d656f3` | Valid groups render; unknown groups stay raw | Only affected groups stay raw | Only affected groups stay raw |

Eight synthetic scenarios per combination test provider registration, the actual
API factory, the actual `CslCitationHost`, contract validation and real `citeproc-ts`
processing: a valid library, unused/cited unsupported types, unused/cited duplicate
keys, unused/cited cyclic crossrefs, and unknown citations. Every problematic
citation is tested beside an independent valid citation and in a mixed group.
Obsidian is stubbed; providers and the CSL engine are real.

## Updating only one plugin

Updating Feuillets first is safe: it retains compatibility with the published
companion but cannot repair that companion's bibliography handling. Update the
companion afterwards to obtain full entry isolation.

Updating only the companion also works for valid libraries, unknown citations and
unused rejected entries. When a rejected entry is cited, published Feuillets 3.5.2
accepts only `UNKNOWN_CITEKEY` as a recoverable error. It treats
`UNSUPPORTED_BIBTEX_TYPE`, `DUPLICATE_CITEKEY`, `AMBIGUOUS_CROSSREF` and
`CYCLIC_CROSSREF` as fatal, preserving the complete document in raw Pandoc syntax.
The host reports an explicit engine error; the provider does not disguise the
diagnostic or substitute a reference.

**For full isolation, update Feuillets before the companion.** The first suitable
public Feuillets version is the first release containing `6ed59b6`; no new version
number is assigned here. A patch release after 3.5.2 can carry it. API discovery
from 3.4.0 is a loading requirement, not a guarantee of the new behavior.

A hard runtime version check would unnecessarily block safe combinations that
already render correctly. No runtime restriction or API change is introduced:
strict contract validation, explicit documentation and release ordering preserve
safety. **Do not replace, rename or simplify personal bibliographies to compensate
for mismatched plugin versions.**

## Required CI integration

The companion's CI and release workflows check out this event's source and a
separate public Feuillets checkout. Set repository variable `FEUILLETS_HOST_REF`
to a full 40-character, reviewed, remotely available Feuillets commit SHA that
contains `npm run test:csl-integration`. Dependencies are installed separately;
Chromium is installed from the host's locked Playwright dependency.

The dedicated test command forces `FEUILLETS_CSL_REQUIRED=1`, validates source and
browser availability and rejects skipped or empty runs. A missing pin or checkout
fails before tests. A missing script in an old host fails rather than silently
falling back to optional testing.

Both correction commits were local when this CI change was prepared. Do not
configure a pin until its code has been pushed with authorization and its remote
availability has been verified. No unavailable commit is hardcoded in a workflow.

For PR checks, `FEUILLETS_HOST_REF` may identify a reviewed development commit.
For a companion release, it must identify the **publicly released** Feuillets
commit. The release workflow verifies the non-draft, non-prerelease GitHub release
and compares its peeled tag commit with the pin. A host merged to `main` but not
released does not satisfy that release prerequisite.

In the Feuillets repository, `FEUILLETS_CSL_REF` pins the companion for CI and
release checks. It may identify a reviewed companion candidate before that
candidate's public release, allowing Feuillets to be released first.

See Feuillets' `docs/CSL-INTEGRATION.md` for the local commands and staged integration
plan. Git integration and user-facing publication are separate operations.
