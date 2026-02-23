import styles from './VideoPlayer.module.css';

interface Props {
  src: string;
}

export default function VideoPlayer({ src }: Props) {
  return (
    <video
      className={styles.video}
      src={src}
      controls
      autoPlay
      playsInline
      preload="metadata"
    />
  );
}
