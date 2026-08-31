import styles from "./status.module.css";

export default function StatusLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className={styles.loadingHero} />
      <div className={styles.loadingSummary} />
      <div className={styles.loadingGrid} />
    </main>
  );
}
