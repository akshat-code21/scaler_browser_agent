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

  async findFormFields(page: Page): Promise<{ titleField?: Locator; descriptionField?: Locator }> {
    const titleField = await this.findElement(page, {
      label: "Bug Title",
      placeholder: "Login button not working on mobile",
      testId: "form-rhf-demo-title",
      nearbyText: "Bug Title",
      type: "text",
    });

    if (!titleField) {
      const titleById = page.locator("#form-rhf-demo-title").first();
      const visible = await titleById.isVisible().catch(() => false);
      if (visible) {
        return { titleField: titleById, descriptionField: await this.findDescription(page) };
      }
    }

    const descriptionField = await this.findDescription(page);

    return { titleField: titleField ?? undefined, descriptionField };
  }

  private async findDescription(page: Page): Promise<Locator | undefined> {
    const field = await this.findElement(page, {
      label: "Description",
      placeholder: "I'm having an issue with the login button on mobile.",
      testId: "form-rhf-demo-description",
      nearbyText: "Description",
      role: "textbox",
    });

    if (field) return field;

    const descById = page.locator("#form-rhf-demo-description").first();
    const visible = await descById.isVisible().catch(() => false);
    if (visible) return descById;

    return undefined;
  }
}