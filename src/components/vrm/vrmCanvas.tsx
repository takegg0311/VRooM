/* eslint-disable react/no-unknown-property */
import { Canvas } from '@react-three/fiber'
import { VRMAvatar } from './vrmAvatar'
import { CameraControls } from './cameraControls'
import { Environment } from '@react-three/drei'
import { Room } from './room'
import { DropZoneFullScreen } from './element/dropZoneFullScreen'
import { useEffect, useState } from 'react'
import { environmentType, useSettingsStore } from 'src/stores/settingsStore'
import shallow from 'zustand/shallow'

// drei 9.36 の preset は閉鎖された CDN（market-assets.fra1.cdn.digitaloceanspaces.com）を参照するため、
// 新しい drei と同じ pmndrs/drei-assets のファイルを直接指定する
const HDRI_ROOT =
  'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/'
const hdriFiles: Record<NonNullable<environmentType>, string> = {
  sunset: 'venice_sunset_1k.hdr',
  dawn: 'kiara_1_dawn_1k.hdr',
  night: 'dikhololo_night_1k.hdr',
  warehouse: 'empty_warehouse_01_1k.hdr',
  forest: 'forest_slope_1k.hdr',
  apartment: 'lebombo_1k.hdr',
  studio: 'studio_small_03_1k.hdr',
  city: 'potsdamer_platz_1k.hdr',
  park: 'rooitou_park_1k.hdr',
  lobby: 'st_fagans_interior_1k.hdr',
}

const VRMCanvas = () => {
  const size = useWindowSize()
  const { environment } = useSettingsStore(
    (state) => ({
      environment: state.environment,
    }),
    shallow,
  )
  return (
    <>
      <Canvas camera={{ fov: 20 }} shadows flat style={{ height: size.height }}>
        <VRMAvatar />
        <mesh position={[0, -0.94, 0.5]} scale={0.5} rotation-y={Math.PI}>
          <Room />
        </mesh>
        <CameraControls />
        <Environment
          background={false}
          path={HDRI_ROOT}
          files={
            hdriFiles[environment as NonNullable<environmentType>] ??
            hdriFiles.sunset
          }
        />
      </Canvas>

      <DropZoneFullScreen />
    </>
  )
}
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  })
  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return windowSize
}

export default VRMCanvas
