// The pane's sections in the order the spec agrees. Each section lives in a
// file of its own; change a section there, not here.

import { blockedSection } from './blocked'
import { countersSection } from './counters'
import { doingNowSection } from './doing-now'
import { lastUpdateSection } from './last-update'
import { linksSection } from './links'
import { progressSection } from './progress'
import { reviewLaterSection } from './review-later'
import type { Section } from './section'
import { surprisesSection } from './surprises'

export const SECTIONS: readonly Section[] = [
  doingNowSection,
  blockedSection,
  reviewLaterSection,
  progressSection,
  linksSection,
  surprisesSection,
  countersSection,
  lastUpdateSection,
]
