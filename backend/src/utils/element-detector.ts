/**
 * Multi-strategy element detector for finding form fields on a page.
 * Strategies are tried in priority order: testId -> label -> placeholder -> role -> CSS -> nearby text.
 * If all strategies fail, last-resort ID-based selectors are used.
 */
import { Page, Locator } from "playwright";
import { logger } from "./logger.js";

interface ElementStrategy {
  name: string;
  find: (page: Page, criteria: FindCriteria) => Locator | null;
}

interface FindCriteria {
  label?: string;
  placeholder?: string;
  testId?: string;
  role?: string;
  name?: string;
  type?: string;
  nearbyText?: string;
}

export class ElementDetector {
  private strategies: ElementStrategy[] = [
    {
      name: "testId",
      find: (page, criteria) => criteria.testId ? page.getByTestId(criteria.testId).first() : null,
    },
    {
      name: "label",
      find: (page, criteria) => criteria.label ? page.getByLabel(criteria.label).first() : null,
    },
    {
      name: "placeholder",
      find: (page, criteria) => criteria.placeholder ? page.locator(`[placeholder="${criteria.placeholder}"]`).first() : null,
    },
    {
      name: "role+name",
      find: (page, criteria) => criteria.role && criteria.name ? page.getByRole(criteria.role as any, { name: criteria.name }).first() : null,
    },
    {
      name: "role",
      find: (page, criteria) => criteria.role ? page.getByRole(criteria.role as any).first() : null,
    },
    {
      name: "name",
      find: (page, criteria) => criteria.name ? page.getByLabel(criteria.name).first() : null,
    },
    {
      name: "css-selector",
      find: (page, criteria) => {
        if (criteria.type) {
          const selector = `input[type="${criteria.type}"]`;
          return page.locator(selector).first();
        }
        return null;
      },
    },
    {
      name: "nearby-text",
      find: (page, criteria) => {
        if (criteria.nearbyText) {
          return page.locator(`:text-is("${criteria.nearbyText}")`).locator("..").locator("input, textarea, select").first();
        }
        return null;
      },
    },
  ];

  /** Tries each strategy in order, returns the first visible element found. */
  async findElement(page: Page, criteria: FindCriteria, timeout = 10000): Promise<Locator | null> {
    for (const strategy of this.strategies) {
      try {
        const locator = strategy.find(page, criteria);
        if (locator) {
          await locator.waitFor({ state: "attached", timeout: 2000 });
          const isVisible = await locator.isVisible({ timeout: 1000 }).catch(() => false);
          if (isVisible) {
            logger.debug(`Element found using strategy`, { strategy: strategy.name, criteria });
            return locator;
          }
        }
      } catch (error) {
        logger.debug(`Strategy failed`, { strategy: strategy.name, error: String(error) });
      }
    }

    logger.warn(`Element not found with any strategy`, { criteria });
    return null;
  }
}

