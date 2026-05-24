import { Change } from '../../model/change';
import { View } from './view';

// A foldable container: groups its children under a stable `id`, optionally
// tagging every row inside it with a `Change` for navigation. The "header"
// is just the first subview by convention; folding collapses everything
// after it.
//
// Sections don't render anything of their own — they're a labeled subtree.
export class SectionView extends View {
  override isFoldable = true;

  constructor(
    private readonly sectionId: string,
    private readonly ownedChange?: Change
  ) {
    super();
  }

  override get id(): string | undefined {
    return this.sectionId;
  }

  override get change(): Change | undefined {
    return this.ownedChange;
  }
}
