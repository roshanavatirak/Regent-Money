import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { AdminBottomTabBar } from './AdminBottomTabBar';
import { AdminDashboardTab } from './AdminDashboardTab';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminLogsTab } from './AdminLogsTab';
import { AdminSettingsTab } from './AdminSettingsTab';

const Tab = createMaterialTopTabNavigator();

export function AdminTabNavigator() {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      backBehavior="history"
      tabBar={(props) => <AdminBottomTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        lazy: true,
        lazyPreloadDistance: 1,
        animationEnabled: false,
      }}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboardTab} />
      <Tab.Screen name="AdminUsers" component={AdminUsersTab} />
      <Tab.Screen name="AdminLogs" component={AdminLogsTab} />
      <Tab.Screen name="AdminSettings" component={AdminSettingsTab} />
    </Tab.Navigator>
  );
}
