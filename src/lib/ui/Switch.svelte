<script lang="ts">
  // An on/off switch: a checkbox with role="switch", drawn as a track and thumb, with its label
  // beside it. Use it for a setting that takes effect at once (a sync being active), not a form field.
  interface Props {
    readonly checked: boolean;
    /** The visible text beside it, naming what it turns on. */
    readonly label: string;
    readonly disabled?: boolean;
    /** Shown on hover: what on and off mean. */
    readonly title?: string;
    readonly onchange: (checked: boolean) => void;
  }

  const { checked, label, disabled = false, title, onchange }: Props = $props();
</script>

<label class="switch" class:disabled {title}>
  <input type="checkbox" role="switch" {checked} {disabled} aria-checked={checked} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class="text">{label}</span>
</label>

<style lang="scss">
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--text-2);
    cursor: pointer;
    user-select: none;
    &.disabled { cursor: default; opacity: 0.6; }
  }
  // The real checkbox stays for the keyboard and screen readers, drawn over by the track.
  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
  }
  .track {
    position: relative;
    flex: none;
    width: 28px;
    height: 16px;
    border-radius: var(--r-full);
    background: var(--border-strong);
    transition: background 120ms var(--ease);
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: var(--r-full);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    transition: transform 120ms var(--ease);
  }
  input:checked + .track { background: var(--accent); }
  input:checked + .track .thumb { transform: translateX(12px); }
  input:focus-visible + .track { box-shadow: var(--focus); }
</style>
