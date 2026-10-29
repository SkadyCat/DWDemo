// Original transparent PNGs drawn with Imagegen; see icons/imagegen-manifest.json.
export const ATTRIBUTE_ICONS = Object.freeze({
  strength: '/talents/icons/strength.png',
  dexterity: '/talents/icons/dexterity.png',
  intelligence: '/talents/icons/intelligence.png',
  constitution: '/talents/icons/constitution.png',
});

export const AttributeIcon = {
  props: { attribute: String },
  setup: () => ({ icons: ATTRIBUTE_ICONS }),
  template: '<svg class="stc-attribute-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><image :href="icons[attribute]" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>',
};
