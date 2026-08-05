/**
 * The primitives every screen in the shell is built from.
 *
 * Import from here, not from the files: `import { Button, EmptyState } from
 * './ui/index.js'`. The split into `Button.tsx`, `Chip.tsx` and so on is for
 * whoever is reading the code, and it will move around; this barrel is the
 * surface six people can write against without watching each other's imports.
 *
 * Styles live in `ui.css`, imported once from `styles/index.css`. A component
 * here never ships its own `<style>`.
 */

export { cx } from './cx.js'

export { Button, IconButton, Spinner } from './Button.js'
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './Button.js'

export {
  Card,
  CardBody,
  CardEyebrow,
  CardMedia,
  CardMeta,
  CardTitle,
  Row,
  RowDate,
  RowIcon,
  RowItem,
  RowList,
} from './Card.js'
export type { CardProps, RowProps } from './Card.js'

export { SplitRow, SplitRowList } from './SplitRow.js'
export type { SplitAction, SplitRowListProps, SplitRowProps } from './SplitRow.js'
export { nextFocusAfterRemoval, removalAnnouncement } from './rowRemoval.js'
export type { FocusTarget } from './rowRemoval.js'

export { AppChip, FilterChip, StatusPill, Tag } from './Chip.js'
export type { FilterChipProps, PillTone, StatusPillProps, TagProps } from './Chip.js'

export { InlineError, SearchInput, Select, Textarea, TextInput } from './Field.js'
export type { SearchInputProps, SelectProps, TextareaProps, TextInputProps } from './Field.js'

export { Checkbox, Radio, SegmentedControl, Stepper, Switch } from './Choice.js'
export type { ChoiceProps, SegmentedControlProps, SegmentedOption, StepperProps } from './Choice.js'

export { Avatar, AvatarStack, Divider, Tile } from './Avatar.js'
export type { AvatarProps, AvatarSize, AvatarStackProps } from './Avatar.js'

export { Banner, EmptyState, ErrorState, Progress, Skeleton, StaleStrip } from './Feedback.js'
export type { EmptyMark, EmptyStateProps, ErrorStateProps, ProgressProps, SkeletonProps } from './Feedback.js'

export { AlertRegion, ToastProvider, useToast } from './Toast.js'
export type { ToastRequest } from './Toast.js'

export { BottomSheet, Modal } from './Overlay.js'
export type { OverlayKind } from './Overlay.js'

/* The logic under the components, exported because it is worth reusing and
 * because a screen occasionally needs the numbers without the chrome. */
export { MAX_VISIBLE, announce, dismissToast, pushToast, toastDuration, toastText } from './toastQueue.js'
export type { Toast, ToastAction, ToastKind } from './toastQueue.js'
export { FOCUSABLE, acceptsScrimDismiss, wrapFocus } from './focusTrap.js'
export { canStep, clampStep } from './stepper.js'
export type { StepBounds } from './stepper.js'
