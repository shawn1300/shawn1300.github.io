import styles from "./environment.module.css";

export default function EnvironmentLoading() {
  return <main className={styles.page} aria-busy="true">
    <div className={styles.loadingShell} />
    <div className={styles.loadingShell} />
    <div className={styles.loadingShell} />
  </main>;
}
