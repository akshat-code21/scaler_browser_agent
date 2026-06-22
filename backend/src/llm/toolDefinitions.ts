export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "navigate_to_url",
      description: "Navigate the browser to a specific URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to navigate to" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "click_on_screen",
      description: "Click on an element by its CSS selector (e.g. #id, .class, button) or by its visible text content (use the 'text' field for visible words on screen)",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector like #search-input, input[type=text], button" },
          text: { type: "string", description: "Visible text content of the element to click (NOT a CSS selector)" },
          x: { type: "number", description: "X coordinate on screen (requires screenshot)" },
          y: { type: "number", description: "Y coordinate on screen (requires screenshot)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_keys",
      description: "TYPE TEXT INTO A FORM FIELD. Use this instead of click_on_screen when you need to fill in input fields. Provide the field's CSS selector, placeholder text, or label.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text content to type into the field" },
          selector: { type: "string", description: "CSS selector for the input field (e.g. #first-name)" },
          placeholder: { type: "string", description: "The placeholder attribute text of the input field" },
          label: { type: "string", description: "The <label> text associated with the input field" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scroll",
      description: "Scroll the page or bring a specific element into view",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to scroll (default: down)" },
          pixels: { type: "number", description: "Number of pixels to scroll (default: 400)" },
          selector: { type: "string", description: "CSS selector of element to scroll into view" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "double_click",
      description: "Double-click on an element by CSS selector, visible text, or coordinates",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector like #id, .class" },
          text: { type: "string", description: "Visible text content of the element" },
          x: { type: "number", description: "X coordinate on screen" },
          y: { type: "number", description: "Y coordinate on screen" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "take_screenshot",
      description: "Capture the current page state as an image that you can see. Call this frequently to observe the page.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export type ToolName = (typeof toolDefinitions)[number]["function"]["name"];
