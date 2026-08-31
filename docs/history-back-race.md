# Rapid Back transaction analysis

## Chromium event order

The rapid test queues several `history.back()` calls before the first traversal
has settled. Chromium can select destinations from the branch that existed when
each request was made. The failing order is:

1. The current child is `contract-form`; the older entry is `contracts`.
2. Back commits `contracts` and dispatches `popstate`.
3. The child controller consumes the dirty form. Its policy synchronously pushes
   a reconstructed `contract-form` and then a transient prompt.
4. A previously queued traversal commits a destination from the old branch. It
   skips both newly pushed entries and delivers an older child, or `child: null`.
5. The old controller loop interpreted the destination as an instruction to pop
   every layer above it. It therefore dismissed the transient and then consumed
   the reconstructed form during the same `popstate`. The visible form DOM could
   survive even though the browser settled on `child: null`.

The later `popstate` is not reentrant, so `handlingPop` is false and cannot reject
it. It is a valid browser event, but its destination belongs to the history
branch that preceded the reconstruction.

## Ordinary prompt Back and the reconstructed-entry race

The first implementation restored a dirty form by calling `pushState(form)`
from the `popstate` which had just consumed it, and immediately followed that
with `pushState(transient)`. This looked like the desired
`contracts -> form -> transient` topology in the synchronous unit harness and
in desktop CI. It did not use the real form entry that was still the direct
Forward entry. On Android Chromium a second Back activation could be accepted
while the first traversal and its newly reconstructed branch were still being
finalized. That activation could retain a destination selected from the old
branch and reach the document boundary. Because the reconstructed form was
exit-protected, `beforeunload` then produced the native Leave-site dialog while
the app prompt remained in the DOM.

Restoration now synchronously commits a reconstructed form child through the
canonical Browser History owner, then commits the transient above it before the
prompt is revealed. Thus a visible prompt has the restored form as its direct
predecessor and one ordinary Back consumes only the transient. Pre-traversal
validation described below rejects destinations selected from the old branch.
This adds no timeout, padding, sentinel, or contract-specific History operation.

## Why Navigation API cancellation was insufficient

The earlier `traverseInFlight` enhancement assumed every overlapping traverse
could be cancelled and that one `popstate` would be the commit boundary. Real
Chromium can already have selected/queued another traversal, and traverse
cancellation is not a universal guarantee. Resetting the flag did not identify
which destination generation the later event represented. Consequently the
stale `popstate` still reached the child controller.

## Central invariant and repair

A browser traversal may perform **at most one logical same-route child
transition**. A destination that skips multiple current layers is treated as a
stale physical destination, not as permission to consume all those layers.
After processing the current top layer, the controller compares the browser
child state with its actual top and uses the canonical Browser History wrapper
to replace the stale current entry in place when they differ.

This yields the stable-point invariant:

```
history.state.child.id === KarhaChildHistory.top().id
```

when a child layer remains. Replacement does not grow history, add padding, or
trap Back. A later Back is a new transition and can consume the next logical
layer. The rule is form-independent and applies to every same-route child.

## Crossing the document boundary

A sufficiently deep queued burst can pass the oldest application entry. No
`popstate` is delivered before a cross-document traversal replaces the page, so
same-document reconciliation cannot handle that final step. Once a child policy
has restored a consumed dirty layer, the layer is marked as document-exit
protected. Protection belongs to that in-memory child layer, so consuming the
layer after Save Draft, discard, successful final Save, or a clean close also
removes it. The canonical Browser History boundary consults that state from a
`beforeunload` guard only when Chromium is actually about to discard the
document. Normal Back-to-prompt and prompt-to-form transitions remain custom
same-document UI and never use the native dialog. This is the standards-based
History API fallback safety net; it adds no history entry and uses no timing.

## Pre-traversal transaction boundary

When the browser exposes the Navigation API, the canonical Browser History
owner observes `navigate` events whose `navigationType` is `traverse`. The child
controller supplies only lifecycle policy: it records the one expected direct
predecessor for a physical Back, or the exact destination of a traversal it
requested itself. Browser History admits that destination once and cancels any
overlapping, stale, skipped, or cross-document destination before it commits.
`popstate` completes the admitted transaction and normal child reconciliation
continues unchanged.

This prevents a burst whose destinations were selected before the first
`popstate` from escaping the current document, without padding history or
repeatedly trapping Back. A later Back after the prompt is visible starts a new
transaction and may consume the transient normally.

The interception is feature-detected. Browsers without `window.navigation`
retain the History API reconciliation and `beforeunload` data-loss guard. That
fallback cannot provide the same pre-commit cancellation guarantee, because
`popstate` is delivered only after traversal; it is intentionally documented as
a weaker last-resort path rather than emulated with sentinels or timing.
Non-cancelable `navigate` events are not admitted into the child transaction:
the browser cannot honor cancellation for them, so `beforeunload` remains the
last-resort document-exit guard and no stale admitted transaction is retained.
