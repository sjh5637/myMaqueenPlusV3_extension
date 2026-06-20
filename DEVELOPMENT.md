# MakeCode 확장 개발 가이드 (Maqueen Plus V3)

이 문서는 이 저장소(`maqueenPlusV3` MakeCode 확장)를 개발/테스트/배포할 때 따라야 할
공식적인 방법과, 그동안 반복해서 겪었던 문제들을 다시 겪지 않기 위한 체크리스트입니다.

## 1. 올바른 개발/테스트 워크플로우 (공식 `pxt` CLI)

이 프로젝트는 **확장(extension) 저장소**입니다. MakeCode 에디터 본체(`pxt-microbit`처럼
git으로 통째로 클론한 거대한 저장소)를 직접 참조하거나 그 경로를 이 프로젝트에 끌어오면
**안 됩니다.** 대신 가벼운 `pxt` CLI를 이 저장소 폴더 안에서 그대로 실행합니다.

```bash
npm install -g pxt        # 최초 1회, 전역 설치
pxt install                # package.json 옆에 pxt_modules/, node_modules/ 에
                            # microbit 타깃을 "npm 패키지"로 받아옴 (git clone 아님)
pxt build                  # 실제 PXT 컴파일러로 빌드 → 진짜 컴파일 오류만 확인 가능
pxt serve                  # 로컬 MakeCode 에디터를 브라우저로 띄워 블록 화면 직접 확인
```

- `pxt_modules/`, `node_modules/`, `built/` 는 모두 `.gitignore` 대상이라 커밋되지 않습니다.
- `pxt build`가 EXIT 0이면 실제 MakeCode 빌드는 통과한다고 신뢰할 수 있습니다.
- `pxt serve`는 npm으로 받은 `pxt-microbit` 패키지에 `libs/` 폴더가 빠져 있어
  로컬 환경에서 타깃 빌드 단계부터 실패할 수 있습니다(이 저장소에서 실제로 발생).
  이 경우 가장 안전한 대안은 **MakeCode 웹(makecode.microbit.org)에서 GitHub 저장소
  URL로 직접 확장을 추가**해서 블록을 확인하는 것입니다.

## 2. `pxt.json`의 `files` 목록이 진실의 원천

실제로 MakeCode가 빌드/배포하는 파일은 **`pxt.json`의 `files` 배열에 명시된 파일들뿐**입니다.
`tsconfig.json`, `pxt-editor-shims.d.ts` 처럼 `files`에 없는 파일은 로컬 IDE 검사에만
영향을 주고 실제 빌드에는 전혀 관여하지 않습니다. 새 파일을 추가했는데 MakeCode에 안 보이면
가장 먼저 `pxt.json`의 `files`에 등록했는지 확인하세요.

## 3. ⭐ MakeCode는 최신 git 태그를 불러온다 (커밋이 아님)

**가장 자주 반복됐던 실수입니다.** MakeCode 에디터는 GitHub 저장소의 최신 *커밋*이 아니라
최신 *릴리스 태그*를 기준으로 확장을 불러옵니다.

- 코드를 아무리 고치고 `git push`해도, 새 태그를 만들지 않으면 MakeCode에는 반영되지 않습니다.
- 새 기능을 커밋한 뒤에는 반드시:
  ```bash
  git tag -a v2.2.35 -m "설명"
  git push origin v2.2.35
  ```
  (또는 `pxt bump` 사용)
- 태그를 push한 뒤에는 MakeCode 에디터에서 해당 확장을 **제거 후 재추가**해야 새 버전이
  로드됩니다 (캐시 때문에 같은 프로젝트에서 새로고침만 해서는 갱신되지 않는 경우가 있음).
- `pxt.json`의 `version` 필드와 git 태그가 서로 달라도 **git 태그가 항상 우선**합니다.

## 4. PXT Static TypeScript의 제약 (일반 TypeScript와 다른 점)

PXT는 일반 TypeScript의 부분집합(Static TypeScript)만 지원합니다. 일반 TS에서는 되는데
PXT에서는 컴파일이 깨지는 패턴들:

- **Union 타입(`T | null`) 미지원**: `let f: (() => void) | null` 같은 선언은 PXT 컴파일러가
  거부합니다. nullable이 필요하면 `let f: () => void = null;` 처럼 단일 함수 타입으로 선언하고
  값으로 `null`을 대입하는 패턴을 쓰세요.
- **namespace 본문에 떠있는 실행문 금지**: 함수 밖에, 다른 함수의 JSDoc과 데코레이터 사이에
  실행문이 끼어들면(예: 디버깅용으로 임시로 넣은 호출문) 전체 namespace 컴파일이 깨지면서
  관련 없는 블록들까지 MakeCode에서 사라집니다. namespace 바로 아래에는 `export function`/
  `export enum`/`export const` 선언만 두세요.
- **블록 함수에는 반드시 `blockId` 지정**: `//% block="..."` 만으로는 부족하고
  `//% blockId=...`를 명시해야 MakeCode가 블록을 안정적으로 인식합니다.
- **이벤트 핸들러 블록은 `handlerStatement=1`**: `onXxx(handler: () => void)` 형태의
  이벤트 등록 함수에는 `//% draggableParameters` 대신 `//% handlerStatement=1`을 사용합니다.

## 5. 툴박스 분류: group vs subcategory vs advanced

세 가지가 헷갈리기 쉬운데 역할이 다릅니다.

| 어노테이션 | 효과 | 제약 |
|---|---|---|
| `//% group="X"` | 카테고리 내부에 제목이 있는 구분선만 생김 (펼쳐지는 패널 아님) | 개수 제한 없음 |
| `//% advanced=true` | 카테고리 맨 아래 "더 보기"(More) 패널 1개 생김 | **카테고리당 1개만 가능**, 복제 불가 |
| `//% subcategories="[...]"` (namespace 레벨) + `//% subcategory="X"` (블록별) | 진짜로 펼쳐지는 하위 패널을 **여러 개** 만들 수 있음 | 이게 "더 보기"를 여러 개 만들고 싶을 때의 정답 |

이 저장소는 `subcategories="['New Features', 'Class']"`를 namespace에 선언하고
각 블록에 `//% subcategory="New Features"` 또는 `//% subcategory="Class"`를 붙여
"새기능"/"수업용" 두 개의 펼쳐지는 패널을 구현했습니다.

## 6. 로케일(다국어) 파일 구조

- `_locales/{lang}/maqueenPlusV3-strings.json`: 블록 텍스트(`함수명|block`), 그룹/서브카테고리/
  카테고리 이름(`{id:group}X`, `{id:subcategory}X`, `{id:category}X`), enum 멤버 텍스트.
- `_locales/{lang}/maqueenPlusV3-jsdoc-strings.json`: 함수 설명(JSDoc) 텍스트.
- 번역이 없는 언어는 자동으로 영어(en)로 fallback됩니다. 새 블록/그룹을 추가했으면
  최소 `ko`/`en`은 채우고, 나머지 언어는 비워둬도 동작은 합니다(완전성을 원하면 채울 것).

## 7. IDE(VSCode)의 "가짜" TypeScript 오류와 그 해결 방법

`pxt_modules/core/pxt-core.d.ts`는 PXT 런타임 전용 컴파일 모드(`--noLib`,
`/// <reference no-default-lib="true"/>`)를 전제로 `Math.idiv`, `Math.clamp` 같은
shim을 선언하면서 `Array`/`String`/`Object`/`Math` 같은 표준 lib 타입을 통째로 재정의합니다.
일반 `tsc`/VSCode 언어 서버는 이 전제를 모르기 때문에:

- `pxt-core.d.ts`를 그대로 포함시키면 표준 lib와 "Duplicate identifier" 충돌이 납니다.
- `pxt-core.d.ts`를 제외하면 `Math.idiv`/`Math.clamp`가 안 보여서 `TS2339` 오류가 납니다.
- `pxt_modules` 전체를 제외하면 `pins`/`basic`/`music` 같은 진짜 필요한 네임스페이스
  선언까지 같이 사라져서 `TS2304` 오류가 대량 발생합니다.

**해결 방법(이 저장소에 적용됨)**: `tsconfig.json`에서 디렉터리 전체 스캔 대신
`"files"` 배열로 컴파일 대상을 명시적으로 한정합니다.

```json
"files": [
    "maqueenPlusV3.ts",
    "pxt-editor-shims.d.ts",
    "pxt_modules/core/dal.d.ts",
    "pxt_modules/core/enums.d.ts",
    "pxt_modules/core/shims.d.ts",
    "pxt_modules/ws2812b/main.ts"
]
```

이 안전한 선언 파일들(`dal.d.ts`/`enums.d.ts`/`shims.d.ts`)은 표준 lib를 재정의하지
않으면서 `pins`/`basic`/`music`/`control` 등을 선언합니다. 여기서 다루지 않는
`Math.idiv`/`Math.clamp`/`Buffer` 인덱싱/`music.playTone`/`pins.i2cWriteNumber` 등은
`pxt-editor-shims.d.ts`(이 저장소에 새로 추가, **`pxt.json`의 `files`에는 등록하지
않아서 실제 빌드와 무관**)에서 declaration merging으로 추가 선언했습니다.

> `pxt_modules/core/music.ts`, `pins.ts`, `pxt-helpers.ts` 같은 PXT 자체 구현 `.ts`
> 파일을 `tsconfig.json`의 `files`에 직접 넣지 마세요. 이 파일들은 서로 의존성이
> 얽혀 있어서(`hex`, `Melodies`, `StringArrayPlayable` 등) 하나를 넣으면 그게 의존하는
> 또 다른 core 파일이 필요해지는 식으로 끝없이 번집니다. 우리 코드(`maqueenPlusV3.ts`)
> 입장에서 필요한 함수 시그니처만 `pxt-editor-shims.d.ts`에 추가하는 게 맞는 방법입니다.

남은 경고(미사용 변수, 불필요한 세미콜론 등)는 실제 코드 스타일 이슈이며 무시해도
안전하지만, 시간이 있으면 정리하는 것을 권장합니다.

`buf[i]` 같은 `Buffer` 인덱싱은 PXT 컴파일러만 이해하는 `//% indexerGet/indexerSet`
shim 문법이라 표준 TypeScript로는 완전히 표현할 수 없는 근본적인 차이입니다.
(`pxt-editor-shims.d.ts`에 `[index: number]: number` 시그니처를 추가해 우회함.)

## 8. 과거에 겪었던 문제 목록 (재발 방지용)

| 문제 | 원인 | 해결 |
|---|---|---|
| MakeCode에 새 블록이 안 보임 | 최신 git 커밋은 했지만 새 태그를 안 만듦 | §3 참고, 태그 push 필수 |
| 라인 안전 모니터 블록만 안 보임 | namespace 안에 함수 밖 실행문이 끼어들어 전체 컴파일이 깨짐 (커밋 678f3db에서 수정) | namespace 본문엔 선언만 두기 |
| `deviationHandler` 타입 오류 | `(() => void) \| null` union 타입을 PXT가 거부 | `() => void` 로 선언하고 `null` 값 대입 |
| 이벤트 핸들러 블록이 드래그 파라미터로 안 뜸 | `draggableParameters` 사용 | `handlerStatement=1` 로 교체 |
| 블록이 toolbox에 전혀 안 뜸 | `blockId` 누락 | 모든 블록 함수에 `blockId` 명시 |
| "더 보기" 패널을 카테고리당 여러 개 만들고 싶었음 | `advanced=true`는 카테고리당 1개 제한 | `subcategories`/`subcategory`로 전환 (§5) |
| IDE에 `Math.idiv`/`Math.clamp`/`Duplicate identifier` 오류 다수 | `pxt_modules/core`의 `--noLib` 선언 파일이 표준 tsc lib와 충돌 | `tsconfig.json`의 `files`로 컴파일 대상 한정 + `pxt-editor-shims.d.ts` (§7) |
| `r$`/`g$`/`b$` "used before being assigned" | if/else 체인에서만 할당되고 초기값 없음 | 선언 시 `= 0` 초기화 (실제 코드 버그, IDE 오탐 아님) |

## 9. 새 작업을 시작하기 전 체크리스트

- [ ] 새 블록 함수에는 `blockId`, `block=`, 적절한 `group=` 또는 `subcategory=` 지정
- [ ] `ko`/`en` 최소 2개 언어의 `*-strings.json`/`*-jsdoc-strings.json`에 번역 추가
- [ ] `pxt build`로 실제 컴파일 검증 (EXIT 0 확인)
- [ ] 커밋 후 새 태그 생성 + push (`git tag -a vX.X.X && git push origin vX.X.X`)
- [ ] MakeCode 에디터에서 확장 제거 후 재추가하여 최종 확인
