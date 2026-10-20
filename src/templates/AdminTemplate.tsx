"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  WEBSITE_NAME,
  ENV,
  ETERC_HOME_URL,
  ETERC_DOCS_URL,
} from "@/engine/config";
import { FlowTrigger } from "@/modules/trongate_control/FlowTrigger";

/**
 * Admin theme — port of modules/templates/views/admin.php
 * (including the interactions provided by templates_module/js/admin.js).
 */
export function AdminTemplate({
  children,
  pageTitle = "Admin Panel",
  theme = "default",
}: {
  children: ReactNode;
  pageTitle?: string;
  theme?: string;
}) {
  const year = new Date().getFullYear();
  const [slideNavOpen, setSlideNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.body.classList.toggle("nav-open", slideNavOpen);
    return () => document.body.classList.remove("nav-open");
  }, [slideNavOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSlideNavOpen(false);
      setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleMenu = (id: string) =>
    setOpenMenus((current) => ({ ...current, [id]: !current[id] }));

  return (
    <div className={`theme-${theme}`} onClick={() => setSettingsOpen(false)}>
      <header>
        <div className="header-lg">
          <div>{WEBSITE_NAME}</div>
          <div className="top-rhs">
            <div>
              <nav>
                <ul className="top-nav">
                  <li>
                    <a href="#" className="highlight">
                      <i className="tg tg-envelope"></i> Messages (1)
                    </a>
                  </li>
                  <li>
                    <a href="#">
                      <i className="tg tg-shopping-cart"></i> Orders
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
            <div
              className="top-rhs-selector"
              onClick={(event) => {
                event.stopPropagation();
                setSettingsOpen((open) => !open);
              }}
            >
              <i className="tg tg-user"></i> &#9660;
            </div>
          </div>
        </div>
        <div className="header-sm">
          <div
            id="hamburger"
            onClick={(event) => {
              event.preventDefault();
              setSlideNavOpen(true);
            }}
          >
            &#9776;
          </div>
          <div>{WEBSITE_NAME}</div>
          <div
            className="top-rhs-selector"
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen((open) => !open);
            }}
          >
            <i className="tg tg-user"></i> &#9660;
          </div>
        </div>

        <div
          id="admin-settings-dropdown"
          className={settingsOpen ? "active" : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <ul>
            <li>
              <a href="/trongate_administrators/update_your_details">
                <i className="tg tg-user"></i> Update Your Details
              </a>
            </li>
            <li className="top-border">
              <a href="/trongate_administrators/logout">
                <i className="tg tg-sign-out"></i> Log Out
              </a>
            </li>
          </ul>
        </div>
      </header>

      <aside>
        {ENV === "dev" ? <FlowTrigger /> : null}
        <nav aria-label="Main navigation">
          <ul className="side-nav-menu">
            <li>
              <a href="#">Dashboard</a>
            </li>
            <li className={`nav-dropdown${openMenus.messages ? " open" : ""}`}>
              <div onClick={() => toggleMenu("messages")}>
                <span>Messages</span>
                <span
                  aria-hidden="true"
                  className={`arrow-icon${openMenus.messages ? " rotate" : ""}`}
                >
                  &#9660;
                </span>
              </div>
              <ul
                id="messages-submenu"
                className="nav-submenu"
                style={{ maxHeight: openMenus.messages ? "300px" : "0" }}
              >
                <li>
                  <a href="#">Inbox</a>
                </li>
                <li>
                  <a href="#">Important</a>
                </li>
                <li>
                  <a href="#">Junk</a>
                </li>
                <li>
                  <a href="#">Archives</a>
                </li>
              </ul>
            </li>
            <li>
              <a href="#">Manage News</a>
            </li>
            <li className={`nav-dropdown${openMenus.reports ? " open" : ""}`}>
              <div onClick={() => toggleMenu("reports")}>
                <span>Reports</span>
                <span
                  aria-hidden="true"
                  className={`arrow-icon${openMenus.reports ? " rotate" : ""}`}
                >
                  &#9660;
                </span>
              </div>
              <ul
                id="reports-submenu"
                className="nav-submenu"
                style={{ maxHeight: openMenus.reports ? "300px" : "0" }}
              >
                <li>
                  <a href="#">Sales Reports</a>
                </li>
                <li>
                  <a href="#">Analytics</a>
                </li>
                <li>
                  <a href="#">Exports</a>
                </li>
              </ul>
            </li>
            <li>
              <a href="#">Settings</a>
            </li>
            <li>
              <a href="#">Manage Users</a>
            </li>
          </ul>
        </nav>
      </aside>

      <main>
        <div className="center-stage">{children}</div>
      </main>

      <footer>
        <div className="footer-lg">
          <div className="footer-left">
            <span>
              &copy; {year} {WEBSITE_NAME}
            </span>
            <span className="separator">|</span>
            <a href={ETERC_HOME_URL} target="_blank" rel="noreferrer">
              Powered by Eterc
            </a>
          </div>
          <div className="footer-right">
            <a href={ETERC_DOCS_URL} target="_blank" rel="noreferrer">
              Documentation
            </a>
            <a href="https://github.com/trongate/trongate-framework" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>

        <div className="footer-sm">
          <div>
            &copy; {year} {WEBSITE_NAME}
          </div>
          <div className="footer-sm-links">
            <a href={ETERC_HOME_URL} target="_blank" rel="noreferrer">
              Powered by Eterc
            </a>
            <span className="separator">|</span>
            <a href={ETERC_DOCS_URL} target="_blank" rel="noreferrer">
              Documentation
            </a>
            <span className="separator">|</span>
            <a href="https://github.com/trongate/trongate-framework" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <div
        className={`nav-overlay${slideNavOpen ? " open" : ""}`}
        id="nav-overlay"
        onClick={() => setSlideNavOpen(false)}
      ></div>

      <nav
        className={`slide-nav${slideNavOpen ? " open" : ""}`}
        id="slide-nav"
        aria-label="Navigation menu"
      >
        <div className="slide-nav-header">
          <div className="slide-nav-close" id="close-slide-nav" onClick={() => setSlideNavOpen(false)}>
            &times;
          </div>
        </div>
        <ul className="slide-nav-list">
          <li>
            <a href="#">Dashboard</a>
          </li>
          <li>
            <a href="#">Manage Users</a>
          </li>
          <li>
            <a href="#">Products</a>
          </li>
          <li>
            <a href="#">Orders</a>
          </li>
          <li>
            <a href="#">Messages (1)</a>
          </li>
          <li>
            <a href="#">Settings</a>
          </li>
          <li>
            <a href="/trongate_administrators/logout">Log Out</a>
          </li>
        </ul>
      </nav>
    </div>
  );
}
