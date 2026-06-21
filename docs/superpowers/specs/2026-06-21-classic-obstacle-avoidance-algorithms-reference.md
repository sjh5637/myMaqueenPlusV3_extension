# 기존 자율주행/회피 알고리즘과 현재 구현 비교 — 참고 자료

읽어보시기 편하도록 정리한 참고 문서입니다. 아직 구현 계획은 아니고, 검색한
내용과 현재 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`/`_DIRECTDRIVE.md`의 구현을
나란히 놓고 비교한 것입니다.

## 가장 먼저 짚을 핵심 차이

아래 4개 알고리즘 전부 **"목표 지점(goal)으로 가면서 장애물을 피한다"**는
전제가 깔려 있습니다(매력(attractive)/반발(repulsive) 힘, 목표 방향 비용 등).
지금 우리 코드는 **목표 지점이 없습니다** — "장애물 피하면서 그냥 계속 트인
곳으로 돌아다니는" 순수 회피/배회(wander) 시스템입니다. 그래서 아래 알고리즘을
"그대로" 가져오기보다는, **그 알고리즘이 장애물을 어떻게 점수화/판단하는지의
아이디어**만 빌려오는 게 맞는 방향입니다.

## 1. Vector Field Histogram (VFH) — 우리 구현과 가장 비슷함

- **개념**: 센서로 주변을 스캔해 방향별로 "막힌 정도"를 극좌표 히스토그램(polar
  histogram)으로 만들고, 그중 충분히 트인 "계곡(valley)" 방향을 골라 그쪽으로
  조향한다. 1991년 Borenstein & Koren가 제안.
- **우리 구현과 비교**: `탐색점수계산()` + `열가중치`가 정확히 이 "방향별 점수화"
  개념입니다. 다만 VFH는 보통 더 촘촘한 극좌표 구간(예: 5도 단위)을 쓰는데,
  우리는 8개 열(7.5도 단위, 60도 FOV 한정)로 더 거칠게 나눕니다. 그리고 VFH는
  "목표 방향에 가까운 계곡을 우선"하는 비용 항이 있는데, 우리는 목표가 없으니
  그 항이 없습니다(그래서 `회전탐색시작()`이 좌/우를 랜덤으로 고릅니다 — VFH라면
  목표 방향에 가까운 쪽을 고를 것입니다).
- **가져올 만한 아이디어**: VFH는 "이 방향이 안전한가"를 이전 틱과 무관하게 매번
  새로 계산하지 않고, 로봇의 현재 속도/회전 관성까지 고려한 비용 함수를 씁니다.
  우리는 회전 관성을 전혀 고려 안 하는데(끼어들 수 있는 회전 탐색이라 그나마
  완화는 됨), 굵게 보면 비슷한 방향입니다.
- **출처**: [Wikipedia: Vector Field Histogram](https://en.wikipedia.org/wiki/Vector_Field_Histogram),
  [원 논문 PDF (CMU)](https://www.cs.cmu.edu/~motionplanning/papers/sbp_papers/integrated1/borenstein_VFHisto.pdf)

## 2. Dynamic Window Approach (DWA) — 임베디드에서 가장 많이 쓰임

- **개념**: 로봇이 "낼 수 있는" 속도·각속도 조합(동적 윈도우) 중에서, 충돌
  안 하고 목표에 가까워지는 조합을 매 틱 비용 함수로 골라 그 속도/각속도를
  명령한다. 계산이 가볍고 ROS에서 표준처럼 쓰여서, 자원이 적은 임베디드 환경에
  특히 적합하다고 알려져 있습니다.
- **우리 구현과 비교**: 우리는 "속도/각속도 조합을 동시에 탐색"하지 않고, 아예
  "직진 중 vs 회전 탐색 중"을 상태로 분리해서 한 번에 하나씩만 합니다(직진하다
  막히면 멈추고 회전, 회전하다 트이면 멈추고 직진). DWA처럼 "회전하면서 동시에
  약간 전진" 같은 부드러운 궤적은 못 만듭니다.
- **알려진 약점**: U자형으로 막힌 곳에서 local minima(국소 최적해에 갇힘)에
  취약합니다. 우리의 5단계 폴백(회전 탐색 반복 실패 → 360도 굵게→세밀 탈출)이
  사실상 이 local minima 탈출을 위한 별도 장치입니다 — DWA류 알고리즘들이
  공통으로 겪는 문제를 우리도 비슷한 방식(다단계 폴백)으로 대응하고 있는
  셈입니다.
- **출처**: [The Dynamic Window Approach to Collision Avoidance (원 논문)](https://www.researchgate.net/publication/3344494_The_Dynamic_Window_Approach_to_Collision_Avoidance)

## 3. Bug 알고리즘(Bug0/Bug1/Bug2) — 가장 단순, 벽 따라가기

- **개념**: 목표를 향해 직진하다가 장애물을 만나면, 장애물 윤곽선을 따라 돌면서
  (wall-following) 다시 목표 쪽으로 갈 수 있는 지점을 찾으면 그쪽으로 빠진다.
  계산量이 거의 없어 저사양 마이크로컨트롤러에도 잘 맞습니다.
- **우리 구현과 비교**: 우리 "회전 탐색"(`회전탐색시작`/`회전탐색틱`)이 Bug
  알고리즘의 "장애물 만나면 멈추고 주변을 본다"는 정신과 가장 비슷합니다.
  다만 Bug는 장애물 "윤곽선을 따라가며" 판단을 갱신하는데(회전하며 계속
  벽과의 거리를 재서, 충분히 돌았다고 판단하면 직진 재시도), 우리는 "충분히
  트인 한 방향을 찾으면 즉시 멈추고 그 방향으로 직진"이라 윤곽선 추적은
  안 합니다 — 더 단순화된 형태입니다.
- **출처**: [Intelligent Bug Algorithm (IBA) 논문](https://arxiv.org/pdf/1312.4552)

## 4. Artificial Potential Field (인공 잠재장) — 직관적이지만 함정 많음

- **개념**: 목표는 로봇을 끌어당기는 힘(attractive), 장애물은 밀어내는 힘
  (repulsive)으로 모델링해서, 합력 방향으로 움직인다.
- **우리 구현과 비교**: `탐색점수계산()`의 가중합산이 약하게 이 개념과
  닿아 있습니다(가까운 장애물일수록 점수를 깎는 게 "반발력"과 비슷한 효과).
  하지만 진짜 포텐셜 필드처럼 연속적인 힘의 합으로 다음 행동을 정하는 게
  아니라, 8개 열 중 "최선"을 이산적으로 고르는 방식이라 다릅니다.
- **알려진 약점 — local minima**: 끌어당기는 힘과 밀어내는 힘이 정확히
  상쇄되는 지점(예: 장애물 정면)에 갇히는 문제가 잘 알려져 있습니다. 목표가
  없는 우리 시스템엔 "끌어당기는 힘"이 없어서 이 특정 함정은 구조적으로
  해당이 안 됩니다 — 다만 우리도 "회전해도 매번 비슷하게 막힌 점수만 나오는"
  상황(좁은 막힌 공간)에서 비슷한 종류의 정체를 겪을 수 있고, 이건 5단계
  폴백으로 대응하고 있습니다.
- **출처**: [Local-Minimum-Free Artificial Potential Field Method 논문](https://www.researchgate.net/publication/354052482_Local-Minimum-Free_Artificial_Potential_Field_Method_for_Obstacle_Avoidance)

## 정리: 지금 구현이 이미 어디쯔 있는가

| | VFH | DWA | Bug | Potential Field | 우리 구현 |
|---|---|---|---|---|---|
| 목표 지점 필요 | O | O | O | O | **X (배회/회피만)** |
| 방향별 점수화 | O(극좌표 히스토그램) | X(속도공간) | X | O(힘의 합) | **O(8열 가중합)** |
| 회전+전진 동시 제어 | X | **O** | X | O | X |
| 막힘 시 동작 | 트인 계곡 선택 | 재탐색 | 벽 따라가기 | 합력 재계산 | **정지→회전 탐색→실패시 360도 탈출** |
| 임베디드 적합성 | 보통(히스토그램 연산) | 높음(가장 흔히 쓰임) | 매우 높음 | 높음 | (이미 micro:bit에서 동작 중) |

결론적으로 우리 구현은 **"목표 없는 단순화된 VFH + Bug식 막힘 대응 + 다단계
탈출 폴백"**을 짜맞춘 형태에 가깝습니다. 이미 알려진 알고리즘 중 하나를
그대로 가져다 쓰는 것보다, 각 알고리즘의 약점(특히 DWA/Potential Field의
local minima)에 대해 이미 알려진 해법들(가져올 만한 것들을 아래에 정리)을
참고해서 우리 시스템의 해당 약점(회전 탐색이 반복 실패하는 좁은 공간)을
보강하는 쪽이 더 실용적입니다.

## 가장 직접적인 발견 — 칩 자체가 신뢰도(target_status)를 이미 제공한다

알고리즘 비교보다 더 우리 하드웨어에 직결된 발견입니다. 우리 센서는 거의
확실히 **ST `VL53L5CX`**(8x8, 63도 대각 FOV — 우리 모듈의 60도/8x8과 정확히
일치)입니다. ST 공식 문서/포럼에 따르면, 이 칩은 **칸(zone)마다 거리값과
별도로 `target_status`(측정 신뢰도)를 함께 내보냅니다**:

- `target_status == 5` → 100% 확실
- `target_status == 6` 또는 `9` → 약 50% 신뢰
- 그 외 값 → 신뢰 안 됨(필터링 권장)

ST 자체 가이드가 "target_status를 확인해서 유효한 데이터만 써야 한다"고
명시할 정도로, **이 칩을 쓰는 모든 프로젝트가 거쳐야 하는 표준 절차**입니다.

오늘 이 세션에서 거의 하루 종일 했던 작업(시작 시점 기준값 비교, 직전 틱 대비
delta, 2틱 연속 확인 등)은 사실상 **`target_status`가 없을 때 그 역할을
간접적으로 추론하려는 우회 방법**이었던 셈입니다. 지금 쓰는 `matrixLidarDistance.ts`
(DFRobot이 만든 이 칩의 micro:bit 래퍼)의 `matrixPointOutput()`을 보면, I2C
응답 패킷에서 거리값 2바이트(`buf[4]`, `buf[5]`)만 읽고 그 이후 바이트는
전혀 안 씁니다:

```typescript
// pxt_modules/matrixLidarDistance/matrixLidarDistance.ts
let buf = recvPacket(address, CMD_FIXED_POINT)
if (buf[0] == ERR_CODE_NONE || buf[0] == STATUS_SUCCESS) {
    ret = buf[4] | buf[5] << 8   // 거리값만 읽고 끝
}
```

`recvPacket()`은 슬레이브가 보낸 길이(`len`)만큼 다 받아서 버퍼에 채워두는데,
그 `len`이 2바이트보다 길다면(즉 슬레이브 펌웨어가 `target_status`도 같이
보내고 있다면) `buf[6]`, `buf[7]` 등에 이미 들어와 있는데 그냥 버려지고
있는 것일 수 있습니다. **이게 진짜인지는 실측으로 확인해봐야 압니다** —
구현은 안 했고, 다음에 확인해볼 만한 가장 유망한 단서로 남겨둡니다. 만약
`target_status`를 실제로 받을 수 있다면, 지금의 기준값/delta/2틱-확인 같은
간접 추론 로직 전체를 훨씬 단순하고 정확한 "신뢰도 5만 쓴다" 식으로 바꿀 수
있습니다.

## (참고, 구현 아님) 가져올 수 있는 아이디어 후보

실제로 적용할지는 따로 논의가 필요합니다 — 여기서는 후보만 나열합니다.

1. **VFH식 더 촘촘한 극좌표 평가**: 지금은 8열(7.5도 단위)로만 평가하는데,
   회전 탐색 중에는 어차피 계속 회전하면서 캐시를 보고 있으니, 회전하는 동안
   "지나친 모든 방향의 점수"를 다 기록해뒀다가 가장 좋았던 방향으로 정확히
   돌아가는 식으로 바꿀 수 있습니다(지금은 "충분히 트인 첫 방향"에서 즉시
   멈추는 방식이라, 그보다 더 트인 방향을 바로 다음에 지나칠 수도 있음).
2. **DWA식 회전+전진 동시 제어**: 지금은 "회전 중엔 전진 안 함, 전진 중엔
   회전 안 함"으로 완전히 분리돼 있습니다. 막힌 방향을 피해 살짝 틀면서
   동시에 느리게 전진하는 식으로 합치면 더 매끄럽게 움직일 수 있습니다(다만
   `controlMotor()` 두 바퀴 속도를 다르게 줘야 해서 구현 난이도가 있습니다 —
   `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE_DIRECTDRIVE.md`가 이미 모터를 직접
   제어하니 이 방향으로 확장하기엔 그 파일이 더 적합합니다).
3. **Bug식 "윤곽선 추적"**: 회전 탐색이 반복 실패하는 좁은 공간에서, 단순히
   다시 랜덤 회전하는 대신 "마지막으로 그나마 점수가 높았던 방향 쪽으로
   벽을 따라가듯 천천히 전진+미세 조향"을 시도해볼 수 있습니다.
4. **`target_status` 직접 활용**(위 발견 항목과 연결) — `matrixLidarDistance.ts`의
   응답 패킷에 실제로 신뢰도 바이트가 들어있는지 raw 바이트를 그대로 로그로
   찍어 확인해보는 게 가장 먼저 해볼 만한 진단입니다. 있다면 기준값/delta
   추론 로직을 단순화할 수 있는 가장 큰 잠재력이 있습니다.

## 같은 VL53L5CX 칩을 쓴 다른 프로젝트

- [robotaro/vl53l5cx_8x8_array_sensor](https://github.com/robotaro/vl53l5cx_8x8_array_sensor) — ESP32로 8x8 데이터 실시간 시각화하는 기본 예제.
- [stm32duino/VL53L5CX](https://github.com/stm32duino/VL53L5CX) — Arduino용 저수준 드라이버 라이브러리(우리 DFRobot 래퍼보다 더 많은 기능 노출).
- [adityakamath/tof_imager_ros](https://github.com/adityakamath/tof_imager_ros) — ROS2로 포인트클라우드 변환(SLAM/매핑 용도, 우리처럼 가벼운 반응형 회피와는 다른 방향).
- Raspberry Pi 5 + VL53L5CX로 만든 자율 회피 로봇 영상도 있습니다([YouTube](https://www.youtube.com/watch?v=hmL6Ey_lPeQ)) — 다만 알고리즘 코드까지 공개됐는지는 확인 못 했습니다.
- DroneBot Workshop 포럼 스레드([링크](https://forum.dronebotworkshop.com/sensors-modules/time-of-flight-tof-vl53l5cx-8x8-pixel-sensor/))에서도 회피 알고리즘 자체보다는 센서 특성(노이즈 ~4%, 중앙부 convex 패턴, "어떤 게 평균/최소/최대인지 헷갈림")에 대한 논의가 많았습니다 — 오늘 우리가 겪은 노이즈 문제가 이 센서를 쓰는 다른 사람들도 똑같이 겪는 흔한 문제라는 뜻으로 보입니다.

## 참고 자료(Sources)

- [Vector Field Histogram - Wikipedia](https://en.wikipedia.org/wiki/Vector_Field_Histogram)
- [FAST OBSTACLE AVOIDANCE FOR MOBILE ROBOTS (VFH 원 논문 PDF)](https://www.cs.cmu.edu/~motionplanning/papers/sbp_papers/integrated1/borenstein_VFHisto.pdf)
- [VFH*: Local Obstacle Avoidance with Look-Ahead Verification](https://www.researchgate.net/publication/2454908_VFH_Local_Obstacle_Avoidance_with_Look-Ahead_Verification)
- [The Dynamic Window Approach to Collision Avoidance](https://www.researchgate.net/publication/3344494_The_Dynamic_Window_Approach_to_Collision_Avoidance)
- [Enhancing Obstacle Avoidance in DWA via Dynamic Obstacle Behavior Prediction](https://www.mdpi.com/2076-0825/14/5/207)
- [Intelligent Bug Algorithm (IBA)](https://arxiv.org/pdf/1312.4552)
- [Obstacle Avoidance and Path Planning Methods for Autonomous Navigation of Mobile Robot (종합 리뷰)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11175283/)
- [Local-Minimum-Free Artificial Potential Field Method for Obstacle Avoidance](https://www.researchgate.net/publication/354052482_Local-Minimum-Free_Artificial_Potential_Field_Method_for_Obstacle_Avoidance)
- GitHub 예시 모음: [obstacle-avoidance 토픽](https://github.com/topics/obstacle-avoidance), [obstacle-avoidance-robot 토픽](https://github.com/topics/obstacle-avoidance-robot), [LIDAR-Obstacle-Avoidance (Turtlebot3)](https://github.com/farrel-a/LIDAR-Obstacle-Avoidance), [LiDAR-Obstacle-Avoidance-Robots (3D)](https://github.com/KshitijBhat/LiDAR-Obstacle-Avoidance-Robots)
- [STMicroelectronics 커뮤니티: VL53L5CX target_status 안내](https://community.st.com/t5/imaging-sensors/vl53l5cx-info-about-target-status/td-p/50674)
- [UM2884: VL53L5CX Ultra Lite Driver 가이드 (target_status 포함 공식 매뉴얼, ST/Pololu 미러)](https://www.pololu.com/file/0J1885/um2884-a-guide-to-using-the-vl53l5cx-multizone-timeofflight-ranging-sensor-with-wide-field-of-view-ultra-lite-driver-uld-stmicroelectronics.pdf)
- [stm32duino/VL53L5CX Arduino 드라이버](https://github.com/stm32duino/VL53L5CX)
- [robotaro/vl53l5cx_8x8_array_sensor](https://github.com/robotaro/vl53l5cx_8x8_array_sensor)
- [adityakamath/tof_imager_ros](https://github.com/adityakamath/tof_imager_ros)
- [DroneBot Workshop 포럼: VL53L5CX 센서 특성 논의](https://forum.dronebotworkshop.com/sensors-modules/time-of-flight-tof-vl53l5cx-8x8-pixel-sensor/)
