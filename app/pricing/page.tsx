import Link from "next/link";

export const metadata = { title: "요금제 · GYEOL (결)" };

const COMMON = ["기분·상황 / 인생작 추천", "작품 상세·감상처 이동", "보관함 (로그인 시 동기화)"];

export default function PricingPage() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-row">
          <Link href="/" className="logo font-editorial">GYEOL · 결</Link>
          <div className="utils"><Link className="link" href="/">← 큐레이션으로</Link></div>
        </div>
      </header>
      <main className="wrap pricing">
        <div className="mono" style={{ color: "var(--text-muted)" }}>PLANS &amp; SUBSCRIPTION</div>
        <h1 className="font-editorial">나에게 맞는 이용 방식</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>핵심 추천과 감상처 연결은 계속 무료입니다. 프리미엄은 더 많은 혜택을 위한 선택 사항입니다.</p>

        <div className="plans">
          <section className="plan current">
            <h3>무료 <span className="mono" style={{ color: "var(--accent)" }}>현재 이용 중</span></h3>
            <div className="price font-editorial">₩0</div>
            <p className="save">&nbsp;</p>
            <ul>{COMMON.map((c) => <li key={c}>{c}</li>)}</ul>
            <button className="outline" disabled>현재 요금제</button>
          </section>
          <section className="plan">
            <h3>프리미엄 월간</h3>
            <div className="price font-editorial">₩1,000<small>/ 월</small></div>
            <p className="save">&nbsp;</p>
            <ul><li>무료 기능 전체</li><li>프리미엄 혜택 (확정 후 안내)</li><li>해지해도 결제 기간 유지</li></ul>
            <button className="outline" disabled>준비 중</button>
          </section>
          <section className="plan">
            <h3>프리미엄 연간</h3>
            <div className="price font-editorial">₩10,000<small>/ 년</small></div>
            <p className="save">월 ₩1,000 × 12개월 대비 ₩2,000 절약</p>
            <ul><li>무료 기능 전체</li><li>프리미엄 혜택 (확정 후 안내)</li><li>해지해도 결제 기간 유지</li></ul>
            <button className="outline" disabled>준비 중</button>
          </section>
        </div>
        <p className="fine">결제는 곧 열릴 예정이에요. 결제는 Groble 결제 페이지에서 진행되며, 결제 수단 정보는 GYEOL에 저장되지 않습니다.</p>
      </main>
      <footer className="footer"><div className="wrap">GYEOL (결)</div></footer>
    </>
  );
}
