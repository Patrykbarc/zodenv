// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
	{
		ignores: ["dist/**", "node_modules/**", "coverage/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettierRecommended,
];
