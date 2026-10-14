import type { SVGProps } from 'react'

export type IconName =
  | 'arrow-left'
  | 'archive'
  | 'arrow-up-right'
  | 'bookmark'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'download'
  | 'edit'
  | 'grid'
  | 'help'
  | 'library'
  | 'list'
  | 'menu'
  | 'plus'
  | 'search'
  | 'settings'
  | 'star'
  | 'trash'
  | 'x'

const paths: Record<IconName, JSX.Element> = {
  'arrow-left': <path d="M19 12H5m7 7-7-7 7-7" />,
  archive: <path d="M4 7.5h16M5.5 7.5v10A1.5 1.5 0 0 0 7 19h10a1.5 1.5 0 0 0 1.5-1.5v-10M8 4h8l1.5 3.5h-11L8 4Zm1.5 9h5" />,
  'arrow-up-right': <path d="M7 17 17 7m-8 0h8v8" />,
  bookmark: <path d="M6.5 4.75A1.75 1.75 0 0 1 8.25 3h7.5a1.75 1.75 0 0 1 1.75 1.75v15l-5.5-3-5.5 3v-15Z" />,
  check: <path d="m5 12 4.2 4.2L19 6.5" />,
  'chevron-left': <path d="m14.5 5-7 7 7 7" />,
  'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" />,
  edit: <path d="M4.5 19.5h4L19 9a2.12 2.12 0 0 0-3-3L5.5 16.5v3ZM14.5 7.5l2 2" />,
  grid: <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.75 9.5a2.3 2.3 0 1 1 3.66 1.85c-.9.65-1.41 1.04-1.41 2.15M12 16.5h.01" /></>,
  library: <><path d="M5 5.5h14v13H5z" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></>,
  list: <><path d="M8 6h10M8 12h10M8 18h10" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  menu: <><path d="M5 7h14M5 12h14M5 17h14" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15 15 4 4" /></>,
  settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.2 13.6 1.25.7-.95 1.65-1.35-.5a7.9 7.9 0 0 1-1.3 1.3l.5 1.35-1.65.95-.7-1.25a8 8 0 0 1-1.8.3L12.7 19.5h-1.9l-.5-1.4a8 8 0 0 1-1.8-.3l-.7 1.25-1.65-.95.5-1.35a7.9 7.9 0 0 1-1.3-1.3l-1.35.5-.95-1.65 1.25-.7a8 8 0 0 1-.3-1.8l-1.4-.5V9.4l1.4-.5a8 8 0 0 1 .3-1.8l-1.25-.7.95-1.65 1.35.5a7.9 7.9 0 0 1 1.3-1.3l-.5-1.35 1.65-.95.7 1.25a8 8 0 0 1 1.8-.3l.5-1.4h1.9l.5 1.4a8 8 0 0 1 1.8.3l.7-1.25 1.65.95-.5 1.35a7.9 7.9 0 0 1 1.3 1.3l1.35-.5.95 1.65-1.25.7a8 8 0 0 1 .3 1.8l1.4.5v1.9l-1.4.5a8 8 0 0 1-.3 1.8Z" /></>,
  star: <path d="m12 4 2.35 4.77 5.27.77-3.81 3.71.9 5.25L12 16.02l-4.71 2.48.9-5.25-3.81-3.71 5.27-.77L12 4Z" />,
  trash: <path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7m2 0v11a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7.5 18V7M10.5 11v5M13.5 11v5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />
}

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: IconProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

export default Icon
