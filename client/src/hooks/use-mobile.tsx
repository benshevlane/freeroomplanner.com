import * as React from "react"
import { safeMatchMedia } from "../lib/safe-match-media"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    const mql = safeMatchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    if (mql) {
      mql.addEventListener("change", onChange)
    }
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => {
      if (mql) {
        mql.removeEventListener("change", onChange)
      }
    }
  }, [])

  return !!isMobile
}
