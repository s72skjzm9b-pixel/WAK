import Image from "next/image";

/**
 * A quick WAK badge when the app is opened: pops in, then fades away by
 * itself (pure CSS, so it never blocks the app). Shown once per visit – the
 * inline script hides it on later full page loads in the same tab.
 */
export function Splash() {
  return (
    <>
      <script
        // runs before paint; the only inline script in the app
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem("wak-splash"))document.documentElement.classList.add("no-splash");else sessionStorage.setItem("wak-splash","1")}catch(e){}`,
        }}
      />
      <div id="wak-splash" aria-hidden="true" className="wak-splash fixed inset-0 z-[100] flex items-center justify-center bg-cobalt">
        <Image src="/brand/wak-badge.png" alt="" width={1000} height={1000} priority className="wak-splash-badge w-56 max-w-[60vw]" />
      </div>
    </>
  );
}
