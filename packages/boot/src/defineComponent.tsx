import React, { forwardRef, useEffect, useRef } from 'react';
import { view } from '@risingstack/react-easy-state';
import {
  SLOT,
  hoistNonReactStatics,
  isFunction,
  isFunctionComponent,
} from '@music163/tango-helpers';
import tangoBoot from './global';
import { mergeRefs } from './helpers';

interface RegisterValueConfig {
  /**
   * 绑定的 value 属性名
   */
  valuePropName?: string;
  /**
   * 设置收集字段值变更的时机
   */
  trigger?: string;
  /**
   * 设置从事件回调中获取 value 值的方法
   */
  getValueFromEvent?: (...args: any[]) => any;
}

interface DesignerConfig {
  /**
   * 是否可拖拽
   */
  draggable?: boolean;
  /**
   * 是否有包裹容器
   */
  hasWrapper?: boolean;
  /**
   * 容器自定义样式
   */
  wrapperStyle?: React.CSSProperties;
  /**
   * 展示方式
   */
  display?: DndBoxProps['display'];
  /**
   * 自定义渲染
   */
  render?: (props: any) => React.ReactNode;
}

interface DefineComponentConfig {
  /**
   * displayName
   */
  name?: string;
  /**
   * 从组件同步值到 model 的配置
   */
  registerValue?: false | RegisterValueConfig;
  /**
   * 注册自定义的组件状态或行为
   * @returns
   */
  registerPageStates?: (
    state: { setValue: (nextValue: any) => any; getValue: () => any },
    ref: any,
  ) => any;
  /**
   * 组件的设计器配置
   */
  designerConfig: DesignerConfig;
}

interface TangoModelComponentProps extends TangoComponentProps {
  /**
   * 默认值
   */
  defaultValue?: any;
  /**
   * 内部 ref
   */
  innerRef?: React.ComponentRef<any>;
}

export interface TangoComponentProps {
  /**
   * 组件的 ID -- 用户跟踪组件，并自动将组件的值绑定到 model 上；同时用作 track id
   */
  tid?: string;
}

const registerEmpty = () => ({});

// TODO: 合并 withDnd 和 defineComponent

export function defineComponent<P>(
  BaseComponent: React.ComponentType<P>,
  options?: DefineComponentConfig,
) {
  const displayName =
    options?.name || BaseComponent.displayName || BaseComponent.name || 'ModelComponent';
  const draggable = options?.designerConfig?.draggable || true;
  const hasWrapper = options?.designerConfig?.hasWrapper || true;
  const display = options?.designerConfig?.display || 'block';
  const isFC = isFunctionComponent(BaseComponent);

  // 这里包上 view ，能够响应 model 变化
  const InnerModelComponent = view((props: P & TangoModelComponentProps) => {
    const config = options?.registerValue || {};

    const valuePropName = config.valuePropName || 'value';
    const trigger = config.trigger || 'onChange';
    const getValueFromEvent = config.getValueFromEvent;
    const registerPageStates = options?.registerPageStates || registerEmpty;
    const { tid, defaultValue, innerRef, ...rest } = props;

    // TODO: 所有属性增加一层 template 解析 prop="{{input1.value}}" 进行一下替换

    const ref = useRef();
    useEffect(() => {
      if (tid) {
        const setValue = (nextValue: any) => {
          tangoBoot.setPageState([tid, 'value'].join('.'), nextValue);
        };
        const getValue = () => {
          return tangoBoot.getPageStateValue(tid);
        };
        const customStates = registerPageStates({ setValue, getValue }, ref.current);
        tangoBoot.setPageState(tid, {
          value: defaultValue,
          setValue(newValue: any) {
            setValue(newValue);
          },
          clear() {
            setValue(undefined);
          },
          ...customStates,
        });
      }
      return () => {
        tangoBoot.clearPageState(tid);
      };
    }, [tid, defaultValue, registerPageStates]);

    const value = tangoBoot.getPageStateValue(tid);

    const onChangeProp = rest[trigger];
    const onChange = (next: any, ...args: any[]) => {
      const nextValue = isFunction(getValueFromEvent) ? getValueFromEvent(next, ...args) : next;
      if (tid) {
        tangoBoot.setPageStateValue(tid, nextValue);
      }

      if (isFunction(onChangeProp)) {
        onChangeProp(next, ...args);
      }
    };

    const override = {
      [valuePropName]: value ?? defaultValue,
      [trigger]: onChange,
    };

    return <BaseComponent {...(rest as P)} {...override} ref={mergeRefs(ref, innerRef)} />;
  });

  // TIP: view 不支持 forwardRef，这里包一层，包到内部组件去消费，外层支持访问到原始的 ref，避免与原始代码产生冲突
  const TangoComponent = forwardRef<unknown, P & TangoComponentProps>((props, ref) => {
    const { tid, ...rest } = props;
    const refs = isFC ? undefined : ref; // innerRef 兼容旧版本

    let ret;
    if (!tid && options.registerValue) {
      ret = <BaseComponent ref={refs} {...(rest as P)} />;
    } else {
      ret = <InnerModelComponent {...props} innerRef={refs} />;
    }

    // TODO: 在 helpers 中提供 isInTangoDesigner 方法
    if ((window as any).__TANGO_DESIGNER__) {
      const designerProps = {
        draggable: draggable ? true : undefined,
        'data-tid': tid,
        'data-dnd': props[SLOT.dnd],
      };
      if (hasWrapper) {
        return (
          <DndBox
            name={displayName}
            display={display}
            style={options.designerConfig?.wrapperStyle}
            {...designerProps}
          >
            {ret}
          </DndBox>
        );
      } else {
        return React.cloneElement(ret, designerProps);
      }
    } else {
      return ret;
    }
  });

  hoistNonReactStatics(TangoComponent, BaseComponent);
  TangoComponent.displayName = `defineComponent(${displayName})`;

  return TangoComponent;
}

interface DndBoxProps extends React.ComponentPropsWithoutRef<'div'> {
  name?: string;
  display?: 'block' | 'inline-block' | 'inline';
}

function DndBox({ name, display, children, style: styleProp, ...rest }: DndBoxProps) {
  const style = {
    display,
    minHeight: 4,
    ...styleProp,
  };
  return (
    <div className={`${name}-designer tango-dndBox`} style={style} {...rest}>
      {children}
    </div>
  );
}
