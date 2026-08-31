import { copyFile, rm } from "node:fs/promises";

const repositoryReadme = new URL("../../../README.md", import.meta.url);
const packageReadme = new URL("../README.md", import.meta.url);

switch (process.argv[2]) {
  case "create":
    await copyFile(repositoryReadme, packageReadme);
    break;
  case "clean":
    await rm(packageReadme, { force: true });
    break;
  default:
    throw new Error("Expected 'create' or 'clean'");
}
