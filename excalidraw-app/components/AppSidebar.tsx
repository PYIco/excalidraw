import { DefaultSidebar, Sidebar, THEME } from "@excalidraw/excalidraw";
import {
  messageCircleIcon,
  presentationIcon,
} from "@excalidraw/excalidraw/components/icons";
import { LinkButton } from "@excalidraw/excalidraw/components/LinkButton";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { CloudDrawingsPanel } from "./CloudDrawingsPanel";

import "./AppSidebar.scss";

export const CLOUD_DRAWINGS_TAB = "drawings";

// tabler-icons: cloud
const cloudIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" />
  </svg>
);

type SidebarPromoCopyProps = {
  text: string;
};

const SidebarPromoCopy = (props: SidebarPromoCopyProps) => {
  return (
    <div className="app-sidebar-promo-copy">
      <div className="app-sidebar-promo-illustration" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 300 250"
          className="app-sidebar-promo-heart"
        >
          <path
            d="M 145 75
           C 110 35, 60 55, 65 120
           C 70 180, 140 190, 215 200
           C 225 180, 260 110, 235 55
           C 210 -5, 140 20, 160 105"
            fill="none"
            stroke="#D06B64"
            strokeWidth="16"
            strokeLinecap="round"
          />
        </svg>

        <div className="app-sidebar-promo-trial-note excalifont">
          14 days of
          <br />
          free trial
        </div>
        <svg
          className="app-sidebar-promo-trial-arrow"
          viewBox="0 0 72 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5 6C23 1 50 8 48 32"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M42 26L48 32L54 26"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="app-sidebar-promo-text">{props.text}</div>
    </div>
  );
};

export const AppSidebar = () => {
  const { theme, openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab={CLOUD_DRAWINGS_TAB}
          title="My drawings"
          style={{
            opacity: openSidebar?.tab === CLOUD_DRAWINGS_TAB ? 1 : 0.4,
          }}
        >
          {cloudIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="comments"
          style={{ opacity: openSidebar?.tab === "comments" ? 1 : 0.4 }}
        >
          {messageCircleIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="presentation"
          style={{ opacity: openSidebar?.tab === "presentation" ? 1 : 0.4 }}
        >
          {presentationIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={CLOUD_DRAWINGS_TAB}>
        <CloudDrawingsPanel />
      </Sidebar.Tab>
      <Sidebar.Tab tab="comments">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/sidebar-comments-promo-${
                theme === THEME.DARK ? "dark" : "light"
              }.jpg)`,
              opacity: 0.9,
            }}
          />
          <SidebarPromoCopy text="Make comments with Excalidraw+" />
          <LinkButton
            href={`${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=excalidraw&utm_medium=app&utm_content=comments_promo#excalidraw-redirect`}
          >
            Sign up now
          </LinkButton>
        </div>
      </Sidebar.Tab>
      <Sidebar.Tab tab="presentation" className="px-3">
        <div className="app-sidebar-promo-container">
          <div
            className="app-sidebar-promo-image"
            style={{
              ["--image-source" as any]: `url(/sidebar-presentation-promo-${
                theme === THEME.DARK ? "dark" : "light"
              }.jpg)`,
              opacity: 0.7,
            }}
          />
          <SidebarPromoCopy text="Create presentation with Excalidraw+" />
          <LinkButton
            href={`${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=excalidraw&utm_medium=app&utm_content=presentations_promo#excalidraw-redirect`}
          >
            Sign up now
          </LinkButton>
        </div>
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
