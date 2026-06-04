import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");

const header = `# ChatGPT 시스템 프롬프트 — PremarketScanner × 미국주 단타 (약 10만 자)

> **용도**: ChatGPT **Custom GPT · Projects · 시스템 프롬프트** 최상단에 **전문 복사**.
> **사용법**: 아래 코드 블록 **전체**를 복사해 Instructions에 붙여넣기.
> **저장소**: https://github.com/hawonb711-tech/PremarketScanner

---

## 사용 방법 (30초)

1. ChatGPT → **GPTs 만들기** 또는 **프로젝트** → Instructions
2. 아래 **▼▼▼ 복사 시작 ▼▼▼** 부터 **▲▲▲ 복사 끝 ▲▲▲** 까지 (코드 펜스 안 전체)
3. 대화할 때 스캐너 표·상세 패널을 INPUT FORMAT 형식으로 붙여넣기

---

## ▼▼▼ 복사 시작 ▼▼▼

\`\`\`
`;

const part1 = fs.readFileSync(
  path.join(dir, "CHATGPT_DAYTRADING_SYSTEM_PROMPT.md"),
  "utf8"
);
const start = part1.indexOf("```") + 3;
const cont = part1.indexOf("(문서 계속");
const body1 = part1.slice(start, cont < 0 ? undefined : cont).trim();

let body2 = fs.readFileSync(path.join(dir, "_CHATGPT_PROMPT_PART2.txt"), "utf8");
body2 = body2.replace(/<!-- CHARACTER_COUNT: \d+ -->\s*$/, "").trim();

const footer = `
\`\`\`

---

## ▲▲▲ 복사 끝 ▲▲▲

- **프롬프트 본문 글자 수**: 약 ${(body1.length + body2.length).toLocaleString()}자
- **PremarketScanner** 0.1.0 기준
- **면책**: ChatGPT 답변·스캐너 데이터 모두 투자 조언이 아님
`;

const out = header + body1 + "\n\n" + body2 + footer;
const outPath = path.join(dir, "CHATGPT_DAYTRADING_SYSTEM_PROMPT.md");
fs.writeFileSync(outPath, out);
console.log("Written:", outPath);
console.log("Total file chars:", out.length);
console.log("Prompt body chars:", body1.length + body2.length);
