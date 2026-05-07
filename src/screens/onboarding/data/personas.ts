import { Ionicons } from "@expo/vector-icons";
import { Persona, PersonaModel } from "../types";

export const personaModels: Record<Persona, PersonaModel> = {
  idea_explorer: {
    name: "Idea Explorer",
    description: "Perfect for testing sparks, rough concepts, and small creative experiments.",
    recommendedPlan: "Starter",
    icon: require("../../../assets/persona-icons/idea-explorer.png")
  },
  learning_builder: {
    name: "Learning Builder",
    description: "For learning by making real things, one small project at a time.",
    recommendedPlan: "Starter",
    icon: require("../../../assets/persona-icons/learning-builder.png")
  },
  hobby_builder: {
    name: "Hobby Builder",
    description: "Perfect for experimenting, learning, and building small ideas from anywhere.",
    recommendedPlan: "Starter",
    icon: require("../../../assets/persona-icons/hobby-builder.png")
  },
  side_project_builder: {
    name: "Side Project Builder",
    description: "For turning spare-time ideas into usable projects without heavy setup.",
    recommendedPlan: "Builder",
    icon: require("../../../assets/persona-icons/side-project-builder.png")
  },
  app_builder: {
    name: "App Builder",
    description: "For creators building real projects, apps, websites, and tools regularly.",
    recommendedPlan: "Builder",
    icon: require("../../../assets/persona-icons/app-builder.png")
  },
  workflow_automator: {
    name: "Workflow Automator",
    description: "For building small tools and automations that save time every week.",
    recommendedPlan: "Builder",
    icon: require("../../../assets/persona-icons/workflow-automator.png")
  },
  product_developer: {
    name: "Product Developer",
    description: "For people using vibe coding as part of their daily workflow.",
    recommendedPlan: "Pro",
    icon: require("../../../assets/persona-icons/product-developer.png")
  },
  power_engineer: {
    name: "Power Engineer",
    description: "For serious builders who want maximum credits and fast iteration from anywhere.",
    recommendedPlan: "Pro",
    icon: require("../../../assets/persona-icons/power-engineer.png")
  }
};

export const personaInsights: Record<Persona, { bullets: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> }> = {
  idea_explorer: {
    bullets: [
      { icon: "sparkles-outline", text: "Turn rough ideas into clickable prototypes" },
      { icon: "color-wand-outline", text: "Test bold concepts without setup" },
      { icon: "rocket-outline", text: "Find the idea worth building next" },
      { icon: "bulb-outline", text: "Explore multiple concepts before committing" }
    ]
  },
  learning_builder: {
    bullets: [
      { icon: "school-outline", text: "Learn by building real apps, not tutorials" },
      { icon: "code-slash-outline", text: "Practice with instant AI guidance" },
      { icon: "trophy-outline", text: "Finish polished projects you can show" },
      { icon: "library-outline", text: "Build confidence with every project" }
    ]
  },
  hobby_builder: {
    bullets: [
      { icon: "hammer-outline", text: "Build useful weekend apps and tools" },
      { icon: "phone-portrait-outline", text: "Experiment from anywhere when ideas hit" },
      { icon: "sparkles-outline", text: "Make small ideas feel premium fast" },
      { icon: "happy-outline", text: "Create projects for fun without heavy setup" }
    ]
  },
  side_project_builder: {
    bullets: [
      { icon: "layers-outline", text: "Shape side projects into real products" },
      { icon: "construct-outline", text: "Build dashboards, tools, and launch pages" },
      { icon: "rocket-outline", text: "Ship faster without waiting for a team" },
      { icon: "trending-up-outline", text: "Turn spare time into visible progress" }
    ]
  },
  app_builder: {
    bullets: [
      { icon: "apps-outline", text: "Create apps, websites, and product screens" },
      { icon: "build-outline", text: "Iterate on real features in minutes" },
      { icon: "rocket-outline", text: "Launch projects that feel ready to use" },
      { icon: "phone-portrait-outline", text: "Design mobile-ready flows from anywhere" }
    ]
  },
  workflow_automator: {
    bullets: [
      { icon: "flash-outline", text: "Automate repetitive work with custom tools" },
      { icon: "sync-outline", text: "Connect quick edits across devices" },
      { icon: "time-outline", text: "Save hours every week with small builds" },
      { icon: "briefcase-outline", text: "Create tools that fit your exact workflow" }
    ]
  },
  product_developer: {
    bullets: [
      { icon: "cube-outline", text: "Ship serious app and software features" },
      { icon: "desktop-outline", text: "Build production-ready tools for work" },
      { icon: "trending-up-outline", text: "Move from idea to launch much faster" },
      { icon: "git-branch-outline", text: "Iterate across product screens and systems" }
    ]
  },
  power_engineer: {
    bullets: [
      { icon: "terminal-outline", text: "Run rapid high-volume build iterations" },
      { icon: "rocket-outline", text: "Ship complex apps, tools, and automations" },
      { icon: "flame-outline", text: "Keep momentum across serious projects" },
      { icon: "speedometer-outline", text: "Push faster with maximum build capacity" }
    ]
  }
};
