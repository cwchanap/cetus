import { useState, type ReactNode } from 'react'
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Canvas, Group } from '@shopify/react-native-skia'

export interface GameCanvasGeometry {
  logicalWidth: number
  logicalHeight: number
  viewWidth: number
  viewHeight: number
}

export interface GamePoint {
  x: number
  y: number
}

const letterbox = (geometry: GameCanvasGeometry) => {
  const scale = Math.min(
    geometry.viewWidth / geometry.logicalWidth,
    geometry.viewHeight / geometry.logicalHeight
  )
  return {
    scale,
    offsetX: (geometry.viewWidth - geometry.logicalWidth * scale) / 2,
    offsetY: (geometry.viewHeight - geometry.logicalHeight * scale) / 2,
  }
}

export function toLogicalPoint(
  localX: number,
  localY: number,
  geometry: GameCanvasGeometry
): GamePoint | null {
  if (
    geometry.viewWidth <= 0 ||
    geometry.viewHeight <= 0 ||
    geometry.logicalWidth <= 0 ||
    geometry.logicalHeight <= 0
  ) {
    return null
  }
  const { scale, offsetX, offsetY } = letterbox(geometry)
  return {
    x: (localX - offsetX) / scale,
    y: (localY - offsetY) / scale,
  }
}

export function toGamePoint(
  localX: number,
  localY: number,
  geometry: GameCanvasGeometry
): GamePoint | null {
  const point = toLogicalPoint(localX, localY, geometry)
  if (
    point === null ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > geometry.logicalWidth ||
    point.y > geometry.logicalHeight
  ) {
    return null
  }
  return point
}

export function GameCanvas({
  logicalWidth,
  logicalHeight,
  style,
  children,
}: {
  logicalWidth: number
  logicalHeight: number
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const [viewSize, setViewSize] = useState<{
    width: number
    height: number
  } | null>(null)

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setViewSize(current =>
      current !== null && current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }

  const geometry: GameCanvasGeometry | null =
    viewSize === null
      ? null
      : {
          logicalWidth,
          logicalHeight,
          viewWidth: viewSize.width,
          viewHeight: viewSize.height,
        }
  const layout = geometry === null ? null : letterbox(geometry)

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      <Canvas style={styles.canvas}>
        {layout === null ? null : (
          <Group
            transform={[
              { translateX: layout.offsetX },
              { translateY: layout.offsetY },
              { scale: layout.scale },
            ]}
          >
            {children}
          </Group>
        )}
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
})
