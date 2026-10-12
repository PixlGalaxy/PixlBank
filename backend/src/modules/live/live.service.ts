interface Subscriber {
  userId: string;
  isAdmin: boolean;
  send: () => void;
}

/**
 * "Something you're looking at changed" pings for open pages. Events carry no
 * data — the page just reloads what it shows through the normal, permission-
 * checked API — so all that matters is who gets told: the lender hears about
 * everything, a debtor only about their own loans.
 */
export class LiveEvents {
  private subscribers = new Set<Subscriber>();

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  /** `borrowerId` is the debtor the change concerns; null tells the lender only. */
  publish(borrowerId: string | null): void {
    for (const s of this.subscribers) {
      if (s.isAdmin || s.userId === borrowerId) s.send();
    }
  }
}
