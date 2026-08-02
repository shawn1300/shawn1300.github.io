"use client";

import { useRef } from "react";
import { FireworksCanvas } from "./fireworks-canvas";
import { getBirthdayContent } from "./content";
import styles from "./page.module.css";
import { useLocale } from "next-intl";

export function BirthdayCard() {
  const locale = useLocale();
  const { birthdayCopy, blessingLines, closingWishes, wishCards } = getBirthdayContent(locale);
  const heroRef = useRef<HTMLElement>(null);
  const blessingRef = useRef<HTMLElement>(null);

  const scrollTo = (target: HTMLElement | null) => {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.shell}>
      <FireworksCanvas />
      <div className={styles.backgroundWash} aria-hidden="true" />
      <main className={styles.page}>
        <section ref={heroRef} className={styles.hero} id="top-anchor">
          <div className={`${styles.ribbon} ${styles.ribbonTop}`} aria-hidden="true" />
          <div className={`${styles.ribbon} ${styles.ribbonBottom}`} aria-hidden="true" />
          <span className={`${styles.star} ${styles.starOne}`} aria-hidden="true">
            ✦
          </span>
          <span className={`${styles.star} ${styles.starTwo}`} aria-hidden="true">
            ✦
          </span>
          <span className={`${styles.star} ${styles.starThree}`} aria-hidden="true">
            ✦
          </span>

          <div className={styles.heroStage}>
            <p className={styles.heroBadge}>{birthdayCopy.heroBadge}</p>
            <div className={styles.heroTitleWrap}>
              <h1 className={styles.heroName}>{birthdayCopy.heroName}</h1>
              <p className={styles.heroTitle}>{birthdayCopy.heroTitle}</p>
            </div>

            <div className={styles.ageMark} aria-label={birthdayCopy.heroTitle}>
              <span className={`${styles.ageRing} ${styles.ageRingOuter}`} />
              <span className={`${styles.ageRing} ${styles.ageRingInner}`} />
              <span className={styles.ageNumber}>50</span>
              <span className={styles.ageLabel}>{birthdayCopy.ageLabel}</span>
            </div>

            <p className={styles.heroQuote}>{birthdayCopy.heroQuote}</p>
            <button
              className={styles.heroButton}
              type="button"
              onClick={() => scrollTo(blessingRef.current)}
            >
              {birthdayCopy.heroButton}
            </button>
          </div>
        </section>

        <section
          ref={blessingRef}
          className={styles.section}
          id="blessing-section"
        >
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{birthdayCopy.blessingEyebrow}</p>
            <h2 className={styles.sectionTitle}>{birthdayCopy.blessingTitle}</h2>
          </div>

          <div className={styles.blessingCard}>
            {blessingLines.map((line) => (
              <p className={styles.blessingLine} key={line}>
                {line}
              </p>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.wishesSection}`}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{birthdayCopy.wishesEyebrow}</p>
            <h2 className={styles.sectionTitle}>{birthdayCopy.wishesTitle}</h2>
          </div>

          <div className={styles.wishList}>
            {wishCards.map((card) => (
              <article className={styles.wishCard} key={card.title}>
                <span className={styles.wishIndex}>{card.index}</span>
                <h3 className={styles.wishTitle}>{card.title}</h3>
                <p className={styles.wishDesc}>{card.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.closingSection}>
          <div className={styles.closingCard}>
            <p className={styles.closingEyebrow}>{birthdayCopy.closingEyebrow}</p>
            <h2 className={styles.closingTitle}>{birthdayCopy.closingTitle}</h2>
            <p className={styles.closingAccent}>{birthdayCopy.closingAccent}</p>
            <p className={styles.closingDesc}>{birthdayCopy.closingDesc}</p>

            <div className={styles.closingWishList}>
              {closingWishes.map((wish) => (
                <p className={styles.closingWishItem} key={wish}>
                  {wish}
                </p>
              ))}
            </div>

            <div className={styles.closingDivider} aria-hidden="true" />
            <p className={styles.closingSign}>{birthdayCopy.sign}</p>
            <button
              className={styles.replayButton}
              type="button"
              onClick={() => scrollTo(heroRef.current)}
            >
              {birthdayCopy.replayButton}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
