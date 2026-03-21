import nextConfig from 'eslint-config-next'

export default [
  ...nextConfig,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      'prefer-const': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
      'import/no-anonymous-default-export': 'off',
    },
  },
]
